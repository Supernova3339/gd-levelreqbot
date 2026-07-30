// Question bank for the post-terms comprehension check (see pages/Quiz.tsx).
// Hand-authored against tools/installer/assets/TERMS.md — every answer is
// drawn directly from that document. Keep this in sync if the terms change.

export interface QuizOption {
    id: string;
    label: string;
}

export interface QuizQuestion {
    id: string;
    question: string;
    options: QuizOption[];
    correctId: string;
}

const BANK: QuizQuestion[] = [
    {
        id: "shell-default",
        question: "Is the scripting engine's operating-system command execution capability enabled by default?",
        options: [
            {id: "a", label: "Yes, it's on unless you turn it off"},
            {id: "b", label: "No, it's disabled by default and must be turned on deliberately"},
            {id: "c", label: "It doesn't exist"},
            {id: "d", label: "Only for marketplace modules, never for your own scripts"},
        ],
        correctId: "b",
    },
    {
        id: "script-review",
        question: "Does Supernova review or certify scripts and modules before you run them?",
        options: [
            {id: "a", label: "Yes, every script is manually reviewed"},
            {id: "b", label: "Only marketplace scripts are reviewed, not your own"},
            {id: "c", label: "No — Supernova does not review, audit, or certify script safety"},
            {id: "d", label: "Only scripts using shell execution are reviewed"},
        ],
        correctId: "c",
    },
    {
        id: "account-risk",
        question: "Who is responsible if Twitch, YouTube, or Geometry Dash takes action against your account for automated use?",
        options: [
            {id: "a", label: "Supernova, since it built the automation"},
            {id: "b", label: "You — that risk comes from the platform's own terms, not Supernova"},
            {id: "c", label: "Nobody, the platforms don't allow this to happen"},
            {id: "d", label: "Whichever party filed a complaint first"},
        ],
        correctId: "b",
    },
    {
        id: "warranty",
        question: "What warranty does the Software come with?",
        options: [
            {id: "a", label: "A standard one-year warranty"},
            {id: "b", label: "None — it's provided \"as is\" and \"as available\""},
            {id: "c", label: "A money-back guarantee"},
            {id: "d", label: "A warranty covering data loss only"},
        ],
        correctId: "b",
    },
    {
        id: "liability-cap",
        question: "Roughly how is Supernova's total liability under the terms capped?",
        options: [
            {id: "a", label: "It isn't capped at all"},
            {id: "b", label: "At whatever you paid Supernova in the last 12 months, or $10, whichever is greater"},
            {id: "c", label: "At $1,000,000 regardless of what you paid"},
            {id: "d", label: "At the cost of a replacement device"},
        ],
        correctId: "b",
    },
    {
        id: "marketplace-authorship",
        question: "Who is the author of most marketplace content?",
        options: [
            {id: "a", label: "Supernova writes everything in the marketplace"},
            {id: "b", label: "Independent third-party Authors, unless a listing is marked official"},
            {id: "c", label: "It's generated automatically"},
            {id: "d", label: "Twitch and YouTube jointly maintain it"},
        ],
        correctId: "b",
    },
    {
        id: "marketplace-review",
        question: "Does Supernova test or certify marketplace content before it's published?",
        options: [
            {id: "a", label: "Yes, every submission goes through manual QA"},
            {id: "b", label: "No — Supernova does not review, test, or certify it"},
            {id: "c", label: "Only content over a certain download count"},
            {id: "d", label: "Only content that touches chat"},
        ],
        correctId: "b",
    },
    {
        id: "harassment",
        question: "According to the terms, what happens if you harass another user or Supernova staff through the Software?",
        options: [
            {id: "a", label: "Nothing — conduct outside the app isn't covered"},
            {id: "b", label: "It's grounds for enforcement action, up to revoking your license"},
            {id: "c", label: "You just get a formal apology request"},
            {id: "d", label: "It voids only your marketplace listings, nothing else"},
        ],
        correctId: "b",
    },
    {
        id: "delivery-guarantee",
        question: "Does Supernova guarantee that chat messages or queue updates will be delivered on time?",
        options: [
            {id: "a", label: "Yes, delivery is guaranteed within one second"},
            {id: "b", label: "No — delivery and timing depend on third-party platforms and aren't guaranteed"},
            {id: "c", label: "Only for paid license holders"},
            {id: "d", label: "Yes, but only during business hours"},
        ],
        correctId: "b",
    },
    {
        id: "credentials-storage",
        question: "Where are your OAuth tokens and Geometry Dash credentials stored?",
        options: [
            {id: "a", label: "On a Supernova server, permanently"},
            {id: "b", label: "Locally on your device, with credentials encrypted as a best effort"},
            {id: "c", label: "They aren't stored anywhere"},
            {id: "d", label: "In plain text in the application log"},
        ],
        correctId: "b",
    },
    {
        id: "refunds",
        question: "If your license is revoked for violating the terms, are you entitled to a refund?",
        options: [
            {id: "a", label: "Always, in full"},
            {id: "b", label: "No, except where required by consumer-protection law"},
            {id: "c", label: "Only if you ask within 24 hours"},
            {id: "d", label: "Yes, but only store credit"},
        ],
        correctId: "b",
    },
    {
        id: "backups",
        question: "Who is responsible for backing up your queue data, configuration, and scripts?",
        options: [
            {id: "a", label: "Supernova backs everything up automatically"},
            {id: "b", label: "You are — Supernova isn't responsible for local data loss"},
            {id: "c", label: "Twitch, since it hosts your chat"},
            {id: "d", label: "Nobody needs to; the Software never loses data"},
        ],
        correctId: "b",
    },
    {
        id: "affiliation",
        question: "Is the Software officially affiliated with Twitch, YouTube, or RobTop Games?",
        options: [
            {id: "a", label: "Yes, all three co-sign every release"},
            {id: "b", label: "Only with Twitch"},
            {id: "c", label: "No — it's explicitly independent and unaffiliated"},
            {id: "d", label: "Only with RobTop Games"},
        ],
        correctId: "c",
    },
    {
        id: "dispute-resolution",
        question: "Under the terms, how are disputes generally required to be resolved?",
        options: [
            {id: "a", label: "As a class action on behalf of all users"},
            {id: "b", label: "On an individual basis, with a jury trial and class action waiver"},
            {id: "c", label: "By a public vote in the Discord server"},
            {id: "d", label: "They can't be resolved at all"},
        ],
        correctId: "b",
    },
    {
        id: "contact-precondition",
        question: "What are you expected to have done before contacting support, legal, or filing a complaint?",
        options: [
            {id: "a", label: "Nothing in particular"},
            {id: "b", label: "Read the terms of service in full"},
            {id: "c", label: "Uninstall and reinstall the Software first"},
            {id: "d", label: "Wait 30 days from installation"},
        ],
        correctId: "b",
    },
];

function shuffled<T>(items: T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Picks `count` random questions from the bank and shuffles both the
 * question order and each question's option order. Called fresh on every
 * attempt so a failed run can't just be memorized and retried verbatim.
 */
export function pickQuizSet(count: number): QuizQuestion[] {
    return shuffled(BANK)
        .slice(0, Math.min(count, BANK.length))
        .map((q) => ({...q, options: shuffled(q.options)}));
}
