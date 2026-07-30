import React, {useCallback, useEffect, useRef, useState} from "react";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {Button} from "./components/Button";
import {useDialog} from "./components/Modal";
import {WizardFrame} from "./components/WizardFrame";
import {
    checkAppRunning,
    closeRunningApp,
    exitInstaller,
    finalizeUninstallNow,
    getSetupState,
    launchAppNow,
    recordQuizPassed,
    restartMachine,
    onFinished,
    onProgress,
    startInstall,
    startUninstall,
    type FinishedEvent,
    type InstallOptions,
    type SetupState,
} from "./lib/ipc";
import {Done, type SetupAction} from "./pages/Done";
import {Extras} from "./pages/Extras";
import {Failed} from "./pages/Failed";
import {License} from "./pages/License";
import {ModeSelect} from "./pages/ModeSelect";
import {Options} from "./pages/Options";
import {ProgressPage} from "./pages/ProgressPage";
import {Quiz} from "./pages/Quiz";
import {UninstallChoice} from "./pages/UninstallChoice";
import {UninstallConfirm} from "./pages/UninstallConfirm";
import {SURVEY_REASONS, UninstallSurvey} from "./pages/UninstallSurvey";

type Step =
    | "mode-select" | "license" | "quiz" | "options" | "extras"
    | "uninstall-choice" | "uninstall-survey" | "uninstall-confirm"
    | "progress" | "done" | "failed";

// Exit codes mirrored from src/args.rs
const EXIT_LICENSE = 2;

export default function App() {
    const dialog = useDialog();
    const [state, setState] = useState<SetupState | null>(null);
    const [step, setStep] = useState<Step>("mode-select");
    const [express, setExpress] = useState(true);
    const [opts, setOpts] = useState<InstallOptions | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [quizPassed, setQuizPassed] = useState(false);
    const [purge, setPurge] = useState(false);
    const [launch, setLaunch] = useState(true);
    const [action, setAction] = useState<SetupAction>("install");
    const [surveyReason, setSurveyReason] = useState<string | null>(null);
    const [surveyNote, setSurveyNote] = useState("");
    // Final-page friction: type UNINSTALL + a short cooldown on the button.
    const [confirmText, setConfirmText] = useState("");
    const [holdSecs, setHoldSecs] = useState(5);
    const [restartNow, setRestartNow] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [finished, setFinished] = useState<FinishedEvent | null>(null);
    // Displayed progress is deliberately dishonest: it eases toward the real
    // value, never quite reaches it, holds at 97% until the work truly ends,
    // and enforces a minimum duration — like every installer you've ever met.
    const [disp, setDisp] = useState(0);
    const targetRef = useRef(0);
    const finishedRef = useRef<FinishedEvent | null>(null);
    const workStart = useRef(0);
    const animRef = useRef<number | null>(null);
    const started = useRef(false);
    const optsRef = useRef<InstallOptions | null>(null);
    optsRef.current = opts;
    const stepRef = useRef<Step>("mode-select");
    stepRef.current = step;

    useEffect(() => {
        let unsubs: (() => void)[] = [];
        (async () => {
            const s = await getSetupState();
            setState(s);
            setOpts(s.options);
            setPurge(s.purge);
            setLaunch(s.options.launch_after);
            setStep(s.mode === "uninstall" ? "uninstall-choice" : "mode-select");
            void getCurrentWindow().setTitle(
                s.mode === "uninstall"
                    ? `${s.manifest.product_name} Uninstall`
                    : `${s.manifest.product_name} Setup`,
            );
            unsubs.push(await onProgress((p) => {
                targetRef.current = p.fraction;
                setLog((prev) => [...prev, p.message]);
            }));
            unsubs.push(await onFinished((f) => {
                finishedRef.current = f;
                setFinished(f);
            }));
        })();
        return () => unsubs.forEach((u) => u());
    }, []);

    const begin = useCallback(async (
        s: SetupState,
        o: InstallOptions,
        doPurge: boolean,
        act: SetupAction,
        reason?: string,
    ) => {
        if (started.current) return;
        const from = stepRef.current;
        started.current = true;
        setAction(act);

        // Switch to the progress screen immediately — checks happen behind it.
        workStart.current = Date.now();
        targetRef.current = 0;
        finishedRef.current = null;
        setFinished(null);
        setDisp(0);
        setLog([]);
        setStep("progress");
        if (animRef.current) window.clearInterval(animRef.current);
        // Uninstalls deliberately crawl — removing things should feel like work.
        const ease = act === "uninstall" ? 0.016 : 0.05;
        const creep = act === "uninstall" ? 0.0003 : 0.0006;
        animRef.current = window.setInterval(() => {
            setDisp((d) => {
                // Ease toward slightly ahead of reality, hold at 97% until the
                // backend says it's truly done — then race to 100.
                const goal = finishedRef.current?.ok
                    ? 1
                    : Math.min(targetRef.current + 0.02, 0.97);
                let next = d + Math.max((goal - d) * ease, goal > d ? creep : 0);
                if (next > goal) next = goal;
                return next;
            });
        }, 50);

        const bail = (backTo: Step) => {
            started.current = false;
            if (animRef.current) window.clearInterval(animRef.current);
            setStep(backTo);
        };

        // Dry runs never block on (or close) a running app — they only simulate.
        if (!o.dry_run && await checkAppRunning()) {
            const kill = s.kill_running || await dialog.confirm({
                title: "One thing first",
                body: `${s.manifest.product_name} is still running. We'll need to close it ` +
                    "before we can continue — is that okay?",
                confirmLabel: "Close it for me",
                cancelLabel: "Not now",
            });
            if (!kill) {
                bail(from);
                return;
            }
            try {
                await closeRunningApp();
            } catch (e) {
                setError(String(e));
                setStep("failed");
                return;
            }
        }
        try {
            if (act === "uninstall") {
                await startUninstall(doPurge, o.dry_run, reason);
            } else if (act === "repair") {
                // Reinstall over the existing location with the recorded
                // choices; data untouched, no offers re-queued.
                const base = s.existing?.options ?? o;
                await startInstall({...base, dry_run: o.dry_run, selected_offers: []});
            } else {
                await startInstall(o);
            }
        } catch (e) {
            started.current = false;
            if (animRef.current) window.clearInterval(animRef.current);
            setError(String(e));
            setStep("failed");
        }
    }, [dialog]);

    // Completion: failures surface immediately; success waits for the lie to
    // catch up (progress ≥98%, minimum elapsed time) before flipping to done.
    useEffect(() => {
        if (!finished || step !== "progress") return;
        if (!finished.ok) {
            if (animRef.current) window.clearInterval(animRef.current);
            setError(finished.error ?? "Unknown error");
            setStep("failed");
            return;
        }
        // Uninstalling "takes a while" — entirely by design.
        const minMs = action === "uninstall" ? 9000 : 4500;
        if (disp >= 0.985 && Date.now() - workStart.current >= minMs) {
            if (animRef.current) window.clearInterval(animRef.current);
            setDisp(1);
            const t = window.setTimeout(() => setStep("done"), 400);
            return () => window.clearTimeout(t);
        }
    }, [finished, disp, step, action]);

    // Never leak the animation timer.
    useEffect(() => () => {
        if (animRef.current) window.clearInterval(animRef.current);
    }, []);

    // Cooldown for the final Uninstall button, restarted on page entry.
    useEffect(() => {
        if (step !== "uninstall-confirm") {
            setHoldSecs(5);
            setConfirmText("");
            return;
        }
        setHoldSecs(5);
        const iv = window.setInterval(
            () => setHoldSecs((s) => (s <= 1 ? 0 : s - 1)),
            1000,
        );
        return () => window.clearInterval(iv);
    }, [step]);

    // --unattended: no questions, straight to work.
    useEffect(() => {
        if (state?.unattended && opts) {
            void begin(state, opts, state.purge,
                state.mode === "uninstall" ? "uninstall" : "install");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    const cancelSetup = useCallback(async (code = 0) => {
        const sure = await dialog.confirm({
            title: "Leaving already?",
            body: "Setup isn't finished. If you leave now, nothing will be installed.",
            confirmLabel: "Leave setup",
            cancelLabel: "Keep going",
        });
        if (sure) await exitInstaller(code);
    }, [dialog]);

    /**
     * Leaving the Done screen. For a real (non-dry) uninstall, this is also
     * the moment the uninstaller's own cleanup gets scheduled — deliberately
     * not any earlier (see install::finalize_uninstall on the Rust side):
     * hide the window first so it doesn't sit there uselessly for the
     * ~2s+ the cleanup script needs to start tearing things down, then
     * schedule it, then actually exit.
     */
    const finishAndExit = useCallback(async () => {
        const s = state;
        const o = optsRef.current;
        if (!s || !o) return;

        if (action === "uninstall" && !o.dry_run) {
            await getCurrentWindow().hide();
            const dir = s.existing?.options.dir ?? o.dir;
            await finalizeUninstallNow(dir);
            await exitInstaller(0);
            return;
        }
        if (restartNow && action !== "uninstall" && !o.dry_run) {
            await restartMachine();
            return;
        }
        if (action !== "uninstall" && !o.dry_run && launch) {
            await launchAppNow((action === "repair" && s.existing?.options.dir) || o.dir);
        }
        await exitInstaller(0);
    }, [state, action, restartNow, launch]);

    if (!state || !opts) return null;

    const m = state.manifest;
    const uninstall = state.mode === "uninstall";
    const hasExtras = !uninstall && m.offers.length > 0;
    const update = !uninstall && state.existing !== null;
    const installLabel = opts.dry_run ? "Simulate" : update ? "Update" : "Install";

    // Express: license → extras (still pushed, very corporate) → go.
    // Custom:  license → components → extras → go.
    const afterLicense = express
        ? (hasExtras ? "extras" : null)
        : "options";
    const goAfterLicense = () => {
        if (afterLicense) setStep(afterLicense);
        else void begin(state, opts, purge, "install");
    };
    // Skipped entirely once the user has already passed it for this exact
    // terms text (tracked server-side, keyed on a hash of the license) —
    // only a genuine change to the terms brings it back.
    const quizNeeded = state.quiz_required;
    const stepAfterQuizGate: Step = quizNeeded ? "quiz" : "license";
    const goPastLicense = () => (quizNeeded ? setStep("quiz") : goAfterLicense());
    const handleQuizPass = (passed: boolean) => {
        setQuizPassed(passed);
        if (passed) void recordQuizPassed();
    };

    /** Survey answer rendered for the uninstall log. */
    const surveyText = () => {
        const label = SURVEY_REASONS.find((r) => r.id === surveyReason)?.label ?? "no answer";
        return surveyNote.trim() ? `${label} — "${surveyNote.trim()}"` : String(label);
    };

    const pages: Record<Step, {
        title: string;
        subtitle: string;
        content: React.ReactNode;
        footer: React.ReactNode;
    }> = {
        "mode-select": {
            title: update ? "Welcome back!" : "Hi! Let's get you set up.",
            subtitle: `${m.product_name} · version ${m.version}` +
                (opts.dry_run ? " · simulation" : ""),
            content: (
                <ModeSelect
                    state={state}
                    onExpress={() => {
                        setExpress(true);
                        setStep("license");
                    }}
                    onCustom={() => {
                        setExpress(false);
                        setStep("license");
                    }}
                />
            ),
            footer: <Button onClick={() => cancelSetup()}>Maybe later</Button>,
        },
        "license": {
            title: "Just a little legal.",
            subtitle: "We promise it's the only paperwork in here.",
            content: <License text={m.license} accepted={accepted} onAccept={setAccepted}/>,
            footer: (
                <>
                    <Button onClick={() => setStep("mode-select")}>Back</Button>
                    <Button primary disabled={!accepted} onClick={goPastLicense}>
                        {!quizNeeded && express && !afterLicense ? installLabel : "Continue"}
                    </Button>
                    <Button onClick={() => cancelSetup(EXIT_LICENSE)}>Cancel</Button>
                </>
            ),
        },
        "quiz": {
            title: "Prove it.",
            subtitle: "A short check that you actually read the above.",
            content: <Quiz onPass={handleQuizPass}/>,
            footer: (
                <>
                    <Button onClick={() => {
                        setQuizPassed(false);
                        setStep("license");
                    }}>Back</Button>
                    <Button primary disabled={!quizPassed} onClick={goAfterLicense}>
                        {express && !afterLicense ? installLabel : "Continue"}
                    </Button>
                    <Button onClick={() => cancelSetup(EXIT_LICENSE)}>Cancel</Button>
                </>
            ),
        },
        "options": {
            title: "Make it yours.",
            subtitle: "Pick the pieces you want. You can't really go wrong.",
            content: <Options state={state} opts={opts} onChange={setOpts}/>,
            footer: (
                <>
                    <Button onClick={() => setStep(stepAfterQuizGate)}>Back</Button>
                    <Button
                        primary
                        onClick={() => (hasExtras ? setStep("extras") : void begin(state, opts, purge, "install"))}
                    >
                        {hasExtras ? "Continue" : installLabel}
                    </Button>
                    <Button onClick={() => cancelSetup()}>Cancel</Button>
                </>
            ),
        },
        "extras": {
            title: "A few nice-to-haves.",
            subtitle: "Hand-picked modules from the marketplace. Totally optional.",
            content: (
                <Extras
                    offers={m.offers}
                    selected={opts.selected_offers}
                    onChange={(ids) => setOpts({...opts, selected_offers: ids})}
                />
            ),
            footer: (
                <>
                    <Button onClick={() => setStep(express ? stepAfterQuizGate : "options")}>Back</Button>
                    <Button primary onClick={() => void begin(state, opts, purge, "install")}>{installLabel}</Button>
                    <Button onClick={() => cancelSetup()}>Cancel</Button>
                </>
            ),
        },
        "uninstall-choice": {
            title: "Before anything drastic…",
            subtitle: "Most problems don't need an uninstall.",
            content: (
                <UninstallChoice
                    onRepair={() => void begin(state, opts, false, "repair")}
                    onRemove={() => setStep("uninstall-survey")}
                />
            ),
            footer: <Button onClick={() => exitInstaller(0)}>Never mind</Button>,
        },
        "uninstall-survey": {
            title: "Can we ask why?",
            subtitle: "Thirty seconds, tops. It really does help.",
            content: (
                <UninstallSurvey
                    reason={surveyReason}
                    onReason={setSurveyReason}
                    note={surveyNote}
                    onNote={setSurveyNote}
                />
            ),
            footer: (
                <>
                    <Button onClick={() => setStep("uninstall-choice")}>Back</Button>
                    <Button primary disabled={!surveyReason} onClick={() => setStep("uninstall-confirm")}>
                        Continue
                    </Button>
                    <Button onClick={() => exitInstaller(0)}>Never mind</Button>
                </>
            ),
        },
        "uninstall-confirm": {
            title: "We're sad to see you go.",
            subtitle: `This removes ${m.product_name} from your computer.`,
            content: (
                <UninstallConfirm
                    state={state}
                    purge={purge}
                    onPurge={setPurge}
                    confirmText={confirmText}
                    onConfirmText={setConfirmText}
                />
            ),
            footer: (
                <>
                    <Button onClick={() => setStep("uninstall-survey")}>Back</Button>
                    <Button
                        primary
                        disabled={confirmText.trim().toUpperCase() !== "UNINSTALL" || holdSecs > 0}
                        onClick={async () => {
                            if (purge) {
                                const sure = await dialog.confirm({
                                    title: "Delete your data too?",
                                    body: "Settings, queue history and modules will be gone for good. " +
                                        "There's no undo for this one.",
                                    confirmLabel: "Delete everything",
                                    cancelLabel: "Keep my data",
                                    danger: true,
                                });
                                if (!sure) return;
                            }
                            // The final hurdle.
                            const really = await dialog.confirm({
                                title: "Last chance",
                                body: `Remove ${m.product_name} now? A repair is still an option.`,
                                confirmLabel: "Remove it",
                                cancelLabel: "Go back",
                                danger: true,
                            });
                            if (!really) return;
                            void begin(state, opts, purge, "uninstall", surveyText());
                        }}
                    >
                        {holdSecs > 0 ? `Uninstall (${holdSecs})` : "Uninstall"}
                    </Button>
                    <Button onClick={() => exitInstaller(0)}>Never mind</Button>
                </>
            ),
        },
        "progress": {
            title: action === "uninstall"
                ? "Tidying up…"
                : action === "repair"
                    ? "Fixing things up…"
                    : opts.dry_run ? "Rehearsing…" : "Making it happen…",
            subtitle: "This usually takes less than a minute.",
            content: <ProgressPage fraction={disp} log={log}/>,
            footer: <Button disabled>Cancel</Button>,
        },
        "done": {
            title: action === "uninstall"
                ? "Goodbye for now."
                : action === "repair" ? "Good as new!" : "You're all set!",
            subtitle: opts.dry_run
                ? "Simulation finished — nothing was changed."
                : action === "uninstall"
                    ? "Everything has been removed."
                    : action === "repair" ? "Repair complete." : "Thanks for installing.",
            content: (
                <Done
                    state={state}
                    action={action}
                    dryRun={opts.dry_run}
                    launch={launch}
                    onLaunch={setLaunch}
                    offerRestart={
                        action !== "uninstall" && !opts.dry_run &&
                        (action === "repair"
                            ? state.existing?.options.install_cli ?? false
                            : opts.install_cli)
                    }
                    restartNow={restartNow}
                    onRestartNow={setRestartNow}
                />
            ),
            footer: (
                <Button primary onClick={() => void finishAndExit()}>
                    {restartNow && action !== "uninstall" && !opts.dry_run
                        ? "Finish & restart"
                        : action !== "uninstall" && !opts.dry_run && launch
                            ? "Finish & launch"
                            : "Finish"}
                </Button>
            ),
        },
        "failed": {
            title: "Well, this is awkward.",
            subtitle: "Something went wrong on our end.",
            content: <Failed error={error}/>,
            footer: <Button onClick={() => exitInstaller(1)}>Close</Button>,
        },
    };

    const windowTitle = uninstall
        ? `${m.product_name} Uninstall`
        : `${m.product_name} Setup`;

    /** The custom window bar's ✕ — same semantics as Cancel per step. */
    const onWindowClose = () => {
        switch (step) {
            case "progress":
                void dialog.alert(
                    "Hang tight",
                    "Setup is right in the middle of something. It'll only be a moment.",
                );
                break;
            case "done":
                void finishAndExit();
                break;
            case "failed":
                void exitInstaller(1);
                break;
            case "uninstall-choice":
            case "uninstall-survey":
            case "uninstall-confirm":
                void exitInstaller(0);
                break;
            default:
                void cancelSetup(step === "license" || step === "quiz" ? EXIT_LICENSE : 0);
        }
    };

    const page = pages[step];
    return (
        <WizardFrame
            windowTitle={windowTitle}
            onClose={onWindowClose}
            title={page.title}
            subtitle={page.subtitle}
            footer={page.footer}
        >
            {page.content}
        </WizardFrame>
    );
}
