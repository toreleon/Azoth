import type React from "react";

type IconProps = {
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

function Icon({
  children,
  className,
  fill = "none",
  stroke = "currentColor",
  strokeWidth = 1.85,
  ...props
}: IconProps & {
  children: React.ReactNode;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={["codex-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-hidden"] ?? "true"}
    >
      {children}
    </svg>
  );
}

export function NewChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5H6.8A2.8 2.8 0 0 0 4 7.8v9.4A2.8 2.8 0 0 0 6.8 20h9.4a2.8 2.8 0 0 0 2.8-2.8V12" />
      <path d="m14.4 4.6 5 5" />
      <path d="M10.8 13.2 19 5a1.8 1.8 0 0 1 2.5 2.5l-8.2 8.2-3.5.8 1-3.3Z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.2 4.2" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.3 2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4.1l2 2.4H18A2.5 2.5 0 0 1 20.5 10v6A2.5 2.5 0 0 1 18 18.5H6A2.5 2.5 0 0 1 3.5 16V7.5Z" />
      <path d="M3.8 9h16.4" />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M9.5 11.5h5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="3.5" width="6" height="10" rx="3" />
      <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props} fill="currentColor" stroke="none">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 10 5 5 5-5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m10 7 5 5-5 5" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function SidebarToggleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M9 4v16" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 7l10 10M17 7 7 17" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </Icon>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    </Icon>
  );
}

export function AgentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v3" />
      <rect x="5" y="6.5" width="14" height="12" rx="4" />
      <path d="M8.5 12h.01M15.5 12h.01M9 15h6M3 12h2M19 12h2" />
    </Icon>
  );
}

export function LightningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m13 2.8-8 10.7h6l-2 7.7 8-10.7h-6l2-7.7Z" />
    </Icon>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 11V6.8a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M11.2 10V5.6a1.6 1.6 0 1 1 3.2 0V11" />
      <path d="M14.4 10.6V7a1.6 1.6 0 0 1 3.2 0v6.2a6 6 0 0 1-6 6h-1.1a6 6 0 0 1-4.7-2.3L3.5 14a1.6 1.6 0 0 1 2.3-2.2L8 14" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.8 20a5.2 5.2 0 0 1 10.4 0" />
      <path d="M16.5 10.7a2.8 2.8 0 1 0-.1-5.3M16.5 14.2c2.4.5 4 2.3 4.2 5.8" />
    </Icon>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="m7.5 10 2.5 2.5L7.5 15M12.5 15h4" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6.2v5.2c0 4.7 2.9 7.5 7 9.1 4.1-1.6 7-4.4 7-9.1V6.2L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 9h16M8 14h3M14 14h2" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 18 10 12l3.5 3.5L20 7" />
      <path d="M16 7h4v4M4 6h6" />
    </Icon>
  );
}

export function PositionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V5M4 20h16" />
      <path d="M8 16v-5M12 16V7M16 16v-3" />
    </Icon>
  );
}

export function HeartbeatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2-5 5 10 2-5h5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11.5v5M12 7.8v.1" />
    </Icon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 7h14M5 12h14M5 17h10" />
    </Icon>
  );
}

export function ModelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6.5v5.2c0 4.6 2.9 7.4 7 9.1 4.1-1.7 7-4.5 7-9.1V6.5L12 3Z" />
    </Icon>
  );
}

export function BrokerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V9.5L12 4l8 5.5V20" />
      <path d="M9 20v-7h6v7" />
    </Icon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <path d="M9 7v0M15 12v0M11 17v0" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 20v-4h-4" />
    </Icon>
  );
}
