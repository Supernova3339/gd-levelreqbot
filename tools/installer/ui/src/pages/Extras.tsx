import {Checkbox} from "../components/Checkbox";
import {GroupBox} from "../components/WizardFrame";
import type {Offer} from "../lib/ipc";

interface ExtrasProps {
    offers: Offer[];
    selected: string[];
    onChange: (ids: string[]) => void;
}

export function Extras({offers, selected, onChange}: ExtrasProps) {
    const toggle = (id: string, on: boolean) =>
        onChange(on ? [...selected, id] : selected.filter((s) => s !== id));

    return (
        <>
            <div className="text-[12px] text-text-secondary">
                One more thing — a few modules we think you'll like. Tick any that sound useful;
                they'll be ready when the app first starts. Or don't. No hard feelings.
            </div>
            <GroupBox label="Recommended for you">
                <div className="flex flex-col">
                    {offers.map((offer) => (
                        <Checkbox
                            key={offer.id}
                            checked={selected.includes(offer.id)}
                            onChange={(v) => toggle(offer.id, v)}
                            label={offer.name}
                            hint={offer.description}
                        />
                    ))}
                </div>
            </GroupBox>
        </>
    );
}
