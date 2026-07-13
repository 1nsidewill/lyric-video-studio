import type { SVGProps, ReactNode } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: IconProps) => (
  <Icon {...p}><path d="M7 5.2v13.6a.6.6 0 0 0 .92.5l10.8-6.8a.6.6 0 0 0 0-1L7.92 4.7A.6.6 0 0 0 7 5.2Z" fill="currentColor" stroke="none" /></Icon>
);
export const IconPause = (p: IconProps) => (
  <Icon {...p}><rect x="6.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none" /></Icon>
);
export const IconMusic = (p: IconProps) => (
  <Icon {...p}><path d="M9 18V6l10-2v10" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="14" r="3" /></Icon>
);
export const IconImage = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L18 19" /></Icon>
);
export const IconFilm = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7.5 4v16M16.5 4v16M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" /></Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}><path d="M5 12.5 10 17.5 19.5 7" /></Icon>
);
export const IconTrash = (p: IconProps) => (
  <Icon {...p}><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2 0v11.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 18.5V7M10 11v6M14 11v6" /></Icon>
);
export const IconPencil = (p: IconProps) => (
  <Icon {...p}><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" /><path d="M13.5 6.5l4 4" /></Icon>
);
export const IconFolder = (p: IconProps) => (
  <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></Icon>
);
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" fill="currentColor" stroke="none" /><path d="M19 13c.2 1.6.6 2 2.2 2.2-1.6.2-2 .6-2.2 2.2-.2-1.6-.6-2-2.2-2.2 1.6-.2 2-.6 2.2-2.2Z" fill="currentColor" stroke="none" /></Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></Icon>
);
export const IconExternal = (p: IconProps) => (
  <Icon {...p}><path d="M14 5h5v5M19 5l-8 8" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></Icon>
);
export const IconCopy = (p: IconProps) => (
  <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon {...p}><path d="M12 4 22 20H2L12 4Z" /><path d="M12 10v4.5M12 17.5v.01" /></Icon>
);
export const IconWave = (p: IconProps) => (
  <Icon {...p}><path d="M3 12h2.5M8 12V7m0 5v5m0-5h0M12 12V4m0 8v8M16 12V8m0 4v4M20.5 12H19" /></Icon>
);
export const IconTimeline = (p: IconProps) => (
  <Icon {...p}><path d="M3 12h18" /><circle cx="9" cy="12" r="2.6" fill="currentColor" stroke="none" /></Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}><path d="M20 8a8 8 0 1 0 1.5 6" /><path d="M20 4v4h-4" /></Icon>
);
