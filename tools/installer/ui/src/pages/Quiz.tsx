import {useMemo, useState} from "react";
import {Button} from "../components/Button";
import {RadioGroup} from "../components/Radio";
import {GroupBox} from "../components/WizardFrame";
import {pickQuizSet} from "../lib/quizQuestions";

const QUESTION_COUNT = 5;

interface QuizProps {
    onPass: (passed: boolean) => void;
}

/**
 * The third hurdle: a randomized, one-question-at-a-time comprehension
 * check on the terms you just scrolled past. Passing requires every
 * question correct; a wrong answer doesn't say which ones, just how many —
 * and starts over with a freshly shuffled set rather than letting you fix
 * the same five in place.
 */
export function Quiz({onPass}: QuizProps) {
    const [attempt, setAttempt] = useState(0);
    const set = useMemo(() => pickQuizSet(QUESTION_COUNT), [attempt]);
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [result, setResult] = useState<"unchecked" | "pass" | "fail">("unchecked");
    const [wrongCount, setWrongCount] = useState(0);

    const q = set[index];
    const isLast = index === set.length - 1;
    const answered = answers[q.id] != null;

    const finish = () => {
        const wrong = set.filter((item) => answers[item.id] !== item.correctId).length;
        setWrongCount(wrong);
        if (wrong === 0) {
            setResult("pass");
            onPass(true);
        } else {
            setResult("fail");
            onPass(false);
        }
    };

    const tryAgain = () => {
        setAttempt((a) => a + 1);
        setIndex(0);
        setAnswers({});
        setResult("unchecked");
        setWrongCount(0);
        onPass(false);
    };

    if (result !== "unchecked") {
        return (
            <div className="flex flex-col gap-3 pt-1 items-start">
                {result === "pass" ? (
                    <p className="m-0 text-[12px] text-text-primary">
                        All {set.length} correct — you're clear to continue.
                    </p>
                ) : (
                    <>
                        <p className="m-0 text-[12px] text-text-primary">
                            {wrongCount} of {set.length} incorrect. Take another look at the
                            terms and try a fresh set of questions.
                        </p>
                        <Button onClick={tryAgain}>Try a new set</Button>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 pt-1">
            <p className="m-0 text-[11px] text-text-muted uppercase tracking-[0.15em]">
                Question {index + 1} of {set.length}
            </p>
            <GroupBox label="Quick check">
                <p className="m-0 mb-1.5 text-[12px] text-text-primary">{q.question}</p>
                <RadioGroup
                    name={q.id}
                    options={q.options}
                    value={answers[q.id] ?? null}
                    onChange={(id) => setAnswers((a) => ({...a, [q.id]: id}))}
                />
            </GroupBox>
            <div className="flex items-center gap-2 flex-shrink-0">
                <Button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
                    Back
                </Button>
                <Button
                    primary
                    disabled={!answered}
                    onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
                >
                    {isLast ? "Finish" : "Next"}
                </Button>
            </div>
        </div>
    );
}
