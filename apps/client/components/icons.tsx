// Small line icons, drawn inline so there is no icon library to install.
// Each takes the current text colour.

import type { ReactNode } from "react";

function Icon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type Props = { size?: number };

// The brand mark: a line that drops, then bounces back higher than it started.
export const ReboundMark = ({ size = 18 }: Props) => (
  <Icon size={size}>
    <path d="M3 9c2 0 3 8 6 8s5-11 9-13" />
    <path d="M14 4h4v4" />
  </Icon>
);

export const Check = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const Shield = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const Sliders = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Icon>
);

export const Book = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </Icon>
);

export const Activity = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Icon>
);

export const Clock = ({ size }: Props) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
);

export const Dumbbell = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
  </Icon>
);

export const Stretch = ({ size }: Props) => (
  <Icon size={size}>
    <circle cx="12" cy="4" r="2" />
    <path d="M4 10l8-2 8 2M12 8v6l-4 7M12 14l4 7" />
  </Icon>
);

export const Plus = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArrowRight = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const Sun = ({ size }: Props) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const Moon = ({ size }: Props) => (
  <Icon size={size}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icon>
);

export const Layers = ({ size }: Props) => (
  <Icon size={size}>
    <path d="m12 2 10 5-10 5L2 7l10-5z" />
    <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
  </Icon>
);

export const Repeat = ({ size }: Props) => (
  <Icon size={size}>
    <path d="m17 1 4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </Icon>
);

export const Calendar = ({ size }: Props) => (
  <Icon size={size}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
);
