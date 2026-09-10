// Small brand-mark badges used to differentiate which platform a queue
// request came from — mirrors the icon assets in src/assets/platforms/.
//
// Beyond the two hardcoded chat-platform brands below, this also resolves
// any other icon-namespace string (lucide:/builtin:/local:/resource:) the
// same way the main <Icon> widget does — so a module can flag per-row
// origin/provider info generically (e.g. polls showing its StrawPoll logo
// on rows that used that provider) through the same `platform="field"`
// binding, not just twitch/youtube.

import {IconByName} from "./Icon";

function TwitchIcon({size}: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img">
            <path
                fill="#9146FF"
                d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"
            />
        </svg>
    );
}

function YouTubeIcon({size}: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img">
            <path
                fill="#FF0000"
                d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
            />
        </svg>
    );
}

const PLATFORM_ICON: Record<string, (props: { size: number }) => React.JSX.Element> = {
    twitch: TwitchIcon,
    youtube: YouTubeIcon,
};

export function PlatformDot({platform, size = 12}: { platform?: string; size?: number }) {
    if (!platform) return null;
    const Icon = PLATFORM_ICON[platform.toLowerCase()];
    return (
        <span
            title={platform}
            style={{display: "inline-flex", flexShrink: 0, lineHeight: 0}}
        >
            {Icon ? <Icon size={size}/> : <IconByName name={platform} size={size}/>}
        </span>
    );
}
