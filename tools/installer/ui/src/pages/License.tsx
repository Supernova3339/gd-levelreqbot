import {Checkbox} from "../components/Checkbox";

interface LicenseProps {
    text: string;
    accepted: boolean;
    onAccept: (accepted: boolean) => void;
}

export function License({text, accepted, onAccept}: LicenseProps) {
    return (
        <>
            <div className="text-[12px] text-text-secondary">
                The boring-but-important part. Have a look, then tick the box so we can keep going.
            </div>
            <div
                className="flex-1 min-h-0 overflow-y-auto bg-bg-card p-3
                           font-mono text-[11px] leading-relaxed text-text-secondary
                           whitespace-pre-wrap select-text"
            >
                {text}
            </div>
            <div className="flex-shrink-0">
                <Checkbox
                    checked={accepted}
                    onChange={onAccept}
                    label="I accept the terms of the License Agreement"
                />
            </div>
        </>
    );
}
