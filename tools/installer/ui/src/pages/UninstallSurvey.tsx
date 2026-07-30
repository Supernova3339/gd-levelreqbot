import {RadioGroup} from "../components/Radio";
import {GroupBox} from "../components/WizardFrame";

export const SURVEY_REASONS = [
    {
        id: "broken",
        label: "Something isn't working right",
        hint: "A repair usually fixes this — the Back button is right there.",
    },
    {id: "features", label: "It's missing something I need"},
    {id: "space", label: "Just tidying up / freeing space"},
    {id: "other", label: "I'd rather not say"},
];

interface UninstallSurveyProps {
    reason: string | null;
    onReason: (id: string) => void;
    note: string;
    onNote: (note: string) => void;
}

/**
 * The second hurdle: the exit survey. Picking an answer is mandatory —
 * that's the whole point. The answer ends up in the uninstall log.
 */
export function UninstallSurvey({reason, onReason, note, onNote}: UninstallSurveyProps) {
    return (
        <div className="flex flex-col gap-3 pt-1">
            <p className="m-0 text-[12px] text-text-secondary">
                Before you go — mind telling us why? It genuinely helps.
            </p>
            <GroupBox label="Why are you uninstalling?">
                <RadioGroup
                    name="uninstall-reason"
                    options={SURVEY_REASONS}
                    value={reason}
                    onChange={onReason}
                />
            </GroupBox>
            <textarea
                value={note}
                onChange={(e) => onNote(e.target.value)}
                placeholder="Anything else we should know? (optional)"
                rows={3}
                className="w-full resize-none rounded-none bg-bg-base border-2 border-bg-surface
                           px-2.5 py-1.5 text-[12px] text-text-primary focus:border-accent"
            />
        </div>
    );
}
