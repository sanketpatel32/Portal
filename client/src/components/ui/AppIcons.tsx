import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Frame = ({
	size = 48,
	children,
	...props
}: IconProps & { children: React.ReactNode }) => (
	<svg
		viewBox="0 0 48 48"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		className="size-8 sm:size-10 md:size-12"
		{...props}
	>
		{children}
	</svg>
);

export const GithubFinderIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Outer orbit ring */}
		<circle
			cx="24"
			cy="24"
			r="20"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.15"
			strokeDasharray="3 3"
		/>
		{/* Central node glow */}
		<circle cx="24" cy="24" r="4.5" fill="currentColor" opacity="0.08" />
		<circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.6" />
		{/* Orbit path */}
		<path
			d="M24 8C20 8 14 12 14 18C14 24 18 28 24 32"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			opacity="0.4"
		/>
		<path
			d="M24 40C30 40 36 34 36 26C36 20 32 16 28 14"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			opacity="0.2"
		/>
		{/* Satellite nodes */}
		<circle
			cx="14"
			cy="18"
			r="2.5"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.5"
		/>
		<circle cx="14" cy="18" r="1" fill="currentColor" opacity="0.3" />
		<circle
			cx="36"
			cy="26"
			r="2.5"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.35"
		/>
		<circle cx="36" cy="26" r="1" fill="currentColor" opacity="0.15" />
		{/* Fork branch lines */}
		<path
			d="M14 18L8 14"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.25"
		/>
		<path
			d="M36 26L42 22"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<circle
			cx="8"
			cy="14"
			r="1.5"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.3"
		/>
		<circle
			cx="42"
			cy="22"
			r="1.5"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.2"
		/>
	</Frame>
);

export const ExpenseTrackerIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Coin circle */}
		<circle
			cx="24"
			cy="25"
			r="17"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.12"
		/>
		<circle
			cx="24"
			cy="25"
			r="14"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.08"
		/>
		{/* Bar chart bars */}
		<rect
			x="11"
			y="22"
			width="4"
			height="12"
			rx="1"
			fill="currentColor"
			opacity="0.5"
		/>
		<rect
			x="17"
			y="17"
			width="4"
			height="17"
			rx="1"
			fill="currentColor"
			opacity="0.35"
		/>
		<rect
			x="23"
			y="12"
			width="4"
			height="22"
			rx="1"
			fill="currentColor"
			opacity="0.65"
		/>
		<rect
			x="29"
			y="20"
			width="4"
			height="14"
			rx="1"
			fill="currentColor"
			opacity="0.25"
		/>
		<rect
			x="35"
			y="15"
			width="4"
			height="19"
			rx="1"
			fill="currentColor"
			opacity="0.4"
		/>
		{/* Rising trend line */}
		<path
			d="M11 33L17 29L23 28L29 30L35 26"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			opacity="0.5"
		/>
		{/* Dollar sign accent */}
		<text
			x="38"
			y="14"
			fontSize="7"
			fontWeight="bold"
			fill="currentColor"
			opacity="0.3"
			fontFamily="monospace"
		>
			$
		</text>
	</Frame>
);

export const NoSqlClientIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Outer curve */}
		<path
			d="M10 16C10 12 14 9 24 9C34 9 38 12 38 16"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			opacity="0.2"
		/>
		{/* Document body */}
		<path
			d="M10 16V36C10 39 14 41 24 41C34 41 38 39 38 36V16"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.5"
		/>
		{/* Nested document structure */}
		<rect
			x="16"
			y="17"
			width="16"
			height="5"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.3"
		/>
		<rect
			x="16"
			y="24"
			width="12"
			height="4"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.2"
		/>
		<rect
			x="16"
			y="30"
			width="14"
			height="3"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.15"
		/>
		{/* Curly brace accent */}
		<path
			d="M34 14L36 15.5L34 17"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.15"
		/>
		{/* JSON dots */}
		<circle cx="14" cy="20" r="1" fill="currentColor" opacity="0.3" />
		<circle cx="14" cy="26" r="1" fill="currentColor" opacity="0.2" />
		<circle cx="14" cy="32" r="1" fill="currentColor" opacity="0.15" />
	</Frame>
);

export const SqlClientIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Database cylinder body */}
		<path
			d="M10 14C10 11 16 8 24 8C32 8 38 11 38 14"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			opacity="0.15"
		/>
		<path
			d="M10 14V34C10 37 16 40 24 40C32 40 38 37 38 34V14"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.5"
		/>
		{/* Cylinder bottom curve */}
		<path
			d="M10 34C10 37 16 40 24 40C32 40 38 37 38 34"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			opacity="0.2"
		/>
		{/* Horizontal table lines */}
		<line
			x1="14"
			y1="20"
			x2="34"
			y2="20"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.3"
		/>
		<line
			x1="14"
			y1="25"
			x2="34"
			y2="25"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.2"
		/>
		<line
			x1="14"
			y1="30"
			x2="34"
			y2="30"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.15"
		/>
		{/* Vertical table separator lines */}
		<line
			x1="20"
			y1="20"
			x2="20"
			y2="35"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.2"
		/>
		<line
			x1="28"
			y1="20"
			x2="28"
			y2="35"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.15"
		/>
		{/* SELECT accent */}
		<rect
			x="14"
			y="16"
			width="20"
			height="4"
			rx="0.5"
			fill="currentColor"
			opacity="0.08"
		/>
		{/* Table header highlight */}
		<line
			x1="14"
			y1="19"
			x2="34"
			y2="19"
			stroke="currentColor"
			strokeWidth="1.5"
			opacity="0.15"
		/>
	</Frame>
);

export const PostmanIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Network connection arcs */}
		<path
			d="M8 12C8 8 14 6 24 6C34 6 40 8 40 12"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.12"
		/>
		<path
			d="M8 12V36C8 40 14 42 24 42C34 42 40 40 40 36V12"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.06"
		/>
		{/* Central node */}
		<circle
			cx="24"
			cy="24"
			r="10"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.35"
		/>
		<circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.08" />
		{/* HTTP method badge */}
		<rect
			x="18"
			y="20"
			width="12"
			height="8"
			rx="2"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.4"
		/>
		<text
			x="24"
			y="26.5"
			fontSize="6"
			fontWeight="bold"
			fill="currentColor"
			opacity="0.6"
			textAnchor="middle"
			fontFamily="monospace"
		>
			GET
		</text>
		{/* Connection lines radiating out */}
		<path
			d="M14 18L8 14"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<path
			d="M34 18L40 14"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.15"
		/>
		<path
			d="M14 30L8 34"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.15"
		/>
		<path
			d="M34 30L40 34"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.2"
		/>
		{/* Arrow heads */}
		<path d="M8 14L12 13.5L10 17Z" fill="currentColor" opacity="0.2" />
		<path d="M40 14L36 13.5L38 17Z" fill="currentColor" opacity="0.15" />
		{/* Request/response indicator dots */}
		<circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.3" />
		<circle cx="36" cy="12" r="1" fill="currentColor" opacity="0.2" />
	</Frame>
);

export const WritingAgentIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Pen nib */}
		<path
			d="M24 8L18 28L24 40L30 28L24 8Z"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinejoin="round"
			opacity="0.5"
		/>
		{/* Nib tip detail */}
		<path
			d="M24 34L22 28L24 8L26 28L24 34Z"
			fill="currentColor"
			opacity="0.06"
		/>
		<circle cx="24" cy="28" r="1.5" fill="currentColor" opacity="0.3" />
		{/* Text lines flowing from nib */}
		<path
			d="M30 16C34 16 38 17 38 19"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<path
			d="M30 21C36 21 40 22.5 40 25"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.15"
		/>
		<path
			d="M30 26C33 26 35 27.5 35 30"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.1"
		/>
		{/* Sparkle accents */}
		<circle cx="37" cy="14" r="1" fill="currentColor" opacity="0.3" />
		<circle cx="42" cy="20" r="0.8" fill="currentColor" opacity="0.2" />
		<circle
			cx="10"
			cy="22"
			r="1.2"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.15"
		/>
		{/* Decorative dots */}
		<circle cx="16" cy="34" r="1" fill="currentColor" opacity="0.15" />
	</Frame>
);

export const KanbanBoardIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Board outline */}
		<rect
			x="6"
			y="8"
			width="36"
			height="32"
			rx="3"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.15"
		/>
		{/* Column dividers */}
		<line
			x1="20"
			y1="8"
			x2="20"
			y2="40"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.12"
		/>
		<line
			x1="32"
			y1="8"
			x2="32"
			y2="40"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.12"
		/>
		{/* Column headers */}
		<rect
			x="8"
			y="10"
			width="10"
			height="4"
			rx="0.5"
			fill="currentColor"
			opacity="0.1"
		/>
		<rect
			x="22"
			y="10"
			width="8"
			height="4"
			rx="0.5"
			fill="currentColor"
			opacity="0.08"
		/>
		<rect
			x="34"
			y="10"
			width="6"
			height="4"
			rx="0.5"
			fill="currentColor"
			opacity="0.06"
		/>
		{/* Cards in column 1 */}
		<rect
			x="8"
			y="17"
			width="10"
			height="6"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.35"
		/>
		<rect
			x="8"
			y="25"
			width="10"
			height="4"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.2"
		/>
		{/* Cards in column 2 */}
		<rect
			x="22"
			y="17"
			width="8"
			height="5"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.25"
		/>
		<rect
			x="22"
			y="24"
			width="8"
			height="7"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.15"
		/>
		<rect
			x="22"
			y="33"
			width="8"
			height="3"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.1"
		/>
		{/* Card in column 3 */}
		<rect
			x="34"
			y="17"
			width="6"
			height="8"
			rx="1"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.2"
		/>
		{/* Card fill accents */}
		<rect
			x="9"
			y="18"
			width="8"
			height="4"
			rx="0.5"
			fill="currentColor"
			opacity="0.04"
		/>
		<rect
			x="23"
			y="18"
			width="6"
			height="2"
			rx="0.5"
			fill="currentColor"
			opacity="0.04"
		/>
	</Frame>
);

export const CronTriggerIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Clock face */}
		<circle
			cx="24"
			cy="24"
			r="16"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.5"
		/>
		{/* Minute ticks */}
		<line
			x1="24"
			y1="9"
			x2="24"
			y2="12"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="24"
			y1="36"
			x2="24"
			y2="39"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="9"
			y1="24"
			x2="12"
			y2="24"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="36"
			y1="24"
			x2="39"
			y2="24"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		{/* Diagonal ticks */}
		<line
			x1="13.4"
			y1="13.4"
			x2="15.5"
			y2="15.5"
			stroke="currentColor"
			strokeWidth="0.8"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<line
			x1="34.6"
			y1="13.4"
			x2="32.5"
			y2="15.5"
			stroke="currentColor"
			strokeWidth="0.8"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<line
			x1="13.4"
			y1="34.6"
			x2="15.5"
			y2="32.5"
			stroke="currentColor"
			strokeWidth="0.8"
			strokeLinecap="round"
			opacity="0.2"
		/>
		<line
			x1="34.6"
			y1="34.6"
			x2="32.5"
			y2="32.5"
			stroke="currentColor"
			strokeWidth="0.8"
			strokeLinecap="round"
			opacity="0.2"
		/>
		{/* Hour hand (pointing to ~2) */}
		<line
			x1="24"
			y1="24"
			x2="30"
			y2="16"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			opacity="0.6"
		/>
		{/* Minute hand (pointing to ~10) */}
		<line
			x1="24"
			y1="24"
			x2="14"
			y2="15"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinecap="round"
			opacity="0.4"
		/>
		{/* Center dot */}
		<circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.5" />
		{/* Schedule / calendar ring accent */}
		<path
			d="M24 4C30 4 36 8 38 14"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.12"
			strokeDasharray="3 3"
		/>
	</Frame>
);

export const ClockCalendarIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Clock face */}
		<circle
			cx="20"
			cy="24"
			r="12"
			stroke="currentColor"
			strokeWidth="1.2"
			opacity="0.5"
		/>
		{/* Hour ticks */}
		<line
			x1="20"
			y1="14"
			x2="20"
			y2="16"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="20"
			y1="32"
			x2="20"
			y2="34"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="10"
			y1="24"
			x2="12"
			y2="24"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		<line
			x1="28"
			y1="24"
			x2="30"
			y2="24"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.3"
		/>
		{/* Hands */}
		<line
			x1="20"
			y1="24"
			x2="25"
			y2="20"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			opacity="0.6"
		/>
		<line
			x1="20"
			y1="24"
			x2="14"
			y2="19"
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
			opacity="0.4"
		/>
		<circle cx="20" cy="24" r="1.5" fill="currentColor" opacity="0.5" />
		{/* Calendar page */}
		<rect
			x="26"
			y="20"
			width="14"
			height="12"
			rx="1.5"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.4"
		/>
		<line
			x1="26"
			y1="24"
			x2="40"
			y2="24"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.25"
		/>
		{/* Calendar rings */}
		<line
			x1="30"
			y1="17"
			x2="30"
			y2="20"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.4"
		/>
		<line
			x1="36"
			y1="17"
			x2="36"
			y2="20"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			opacity="0.4"
		/>
		{/* Date dots */}
		<circle cx="30" cy="28" r="0.8" fill="currentColor" opacity="0.3" />
		<circle cx="33" cy="28" r="0.8" fill="currentColor" opacity="0.2" />
		<circle cx="36" cy="28" r="0.8" fill="currentColor" opacity="0.15" />
		<circle cx="30" cy="31" r="0.8" fill="currentColor" opacity="0.2" />
	</Frame>
);

export const BookmarkManagerIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Outer bookmark ribbon */}
		<path
			d="M16 10H32C33 10 34 11 34 12V40L24 32L14 40V12C14 11 15 10 16 10Z"
			stroke="currentColor"
			strokeWidth="1.2"
			strokeLinejoin="round"
			opacity="0.5"
		/>
		{/* Inner fill accent */}
		<path d="M16 12H32V37L24 30L16 37V12Z" fill="currentColor" opacity="0.04" />
		{/* Second bookmark (stacked) */}
		<path
			d="M20 6H36C37 6 38 7 38 8V36"
			stroke="currentColor"
			strokeWidth="1"
			strokeLinecap="round"
			strokeLinejoin="round"
			opacity="0.2"
		/>
		{/* Star accent */}
		<path
			d="M24 18L25.2 21.2L28.5 21.4L26 23.6L26.8 26.8L24 25.1L21.2 26.8L22 23.6L19.5 21.4L22.8 21.2L24 18Z"
			fill="currentColor"
			opacity="0.25"
		/>
	</Frame>
);

export const PickerWheelIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Pointer at top */}
		<path d="M24 4L21 10H27L24 4Z" fill="currentColor" opacity="0.85" />
		{/* Outer wheel ring */}
		<circle
			cx="24"
			cy="25"
			r="16"
			stroke="currentColor"
			strokeWidth="1"
			opacity="0.2"
		/>
		{/* Pie segments */}
		<path
			d="M24 25L24 9A16 16 0 0 1 38 19Z"
			fill="currentColor"
			opacity="0.28"
		/>
		<path
			d="M24 25L38 19A16 16 0 0 1 32 38Z"
			fill="currentColor"
			opacity="0.14"
		/>
		<path
			d="M24 25L32 38A16 16 0 0 1 12 36Z"
			fill="currentColor"
			opacity="0.2"
		/>
		{/* Segment divider lines */}
		<path
			d="M24 9V25M38 19L24 25M32 38L24 25M12 36L24 25"
			stroke="currentColor"
			strokeWidth="0.8"
			opacity="0.4"
		/>
		{/* Hub */}
		<circle cx="24" cy="25" r="2.5" fill="currentColor" opacity="0.6" />
	</Frame>
);

export const JsonToolkitIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Left brace */}
		<path
			d="M19 9C16 9 15 10.5 15 13V17C15 18.5 14 19.5 12 19.5C14 19.5 15 20.5 15 22V26C15 28.5 16 30 19 30"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			opacity="0.7"
		/>
		{/* Right brace */}
		<path
			d="M29 9C32 9 33 10.5 33 13V17C33 18.5 34 19.5 36 19.5C34 19.5 33 20.5 33 22V26C33 28.5 32 30 29 30"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			opacity="0.7"
		/>
		{/* Center dots (JSON values) */}
		<circle cx="21" cy="19.5" r="1.4" fill="currentColor" opacity="0.9" />
		<circle cx="24" cy="19.5" r="1.4" fill="currentColor" opacity="0.55" />
		<circle cx="27" cy="19.5" r="1.4" fill="currentColor" opacity="0.3" />
	</Frame>
);

export const PomodoroTimerIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Outer clock ring */}
		<circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1.6" opacity="0.25" />
		{/* Progress arc (top-right quadrant, emerald feel via opacity) */}
		<path
			d="M24 10 A14 14 0 0 1 38 24"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			opacity="0.8"
		/>
		{/* Clock hands */}
		<path d="M24 24V16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
		<path d="M24 24L30 28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
		{/* Center dot */}
		<circle cx="24" cy="24" r="1.6" fill="currentColor" opacity="0.7" />
	</Frame>
);

export const RegexTesterIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Pattern line with .* wildcard dots */}
		<text
			x="24"
			y="22"
			textAnchor="middle"
			fontFamily="monospace"
			fontSize="11"
			fontWeight="bold"
			fill="currentColor"
			opacity="0.8"
		>
			/.*/
		</text>
		{/* Underline match highlight */}
		<path d="M13 28H35" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />
		<path d="M16 28H28" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
	</Frame>
);

export const PasswordGeneratorIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Shield outline */}
		<path
			d="M24 8L12 13V22C12 30 17 35 24 38C31 35 36 30 36 22V13L24 8Z"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinejoin="round"
			opacity="0.4"
		/>
		{/* Key hole / asterisk pattern inside */}
		<path
			d="M24 17V27M19 19.5L29 24.5M29 19.5L19 24.5"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			opacity="0.8"
		/>
		{/* Center dot */}
		<circle cx="24" cy="22" r="2" fill="currentColor" opacity="0.9" />
	</Frame>
);

export const ColorPaletteIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Three overlapping color swatches */}
		<rect x="9" y="14" width="16" height="16" rx="2" fill="currentColor" opacity="0.5" />
		<rect x="16" y="18" width="16" height="16" rx="2" fill="currentColor" opacity="0.3" />
		<rect x="13" y="11" width="16" height="16" rx="2" fill="currentColor" opacity="0.7" />
		{/* Droplet accent */}
		<path
			d="M29 11C29 11 33 15 33 18C33 20 31 21.5 29 21.5C27 21.5 25 20 25 18C25 15 29 11 29 11Z"
			fill="currentColor"
			opacity="0.3"
		/>
	</Frame>
);

export const MarkdownPreviewerIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Document body lines */}
		<rect x="12" y="8" width="24" height="32" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.25" />
		{/* Heading bar */}
		<path d="M16 14H26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
		{/* Body lines */}
		<path d="M16 19H32M16 23H32M16 27H28" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
		{/* Eye (preview) accent */}
		<circle cx="30" cy="33" r="3" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
		<circle cx="30" cy="33" r="1" fill="currentColor" opacity="0.9" />
	</Frame>
);

export const EpochConverterIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Clock face */}
		<circle cx="24" cy="24" r="13" stroke="currentColor" strokeWidth="1.4" opacity="0.3" />
		{/* Binary/digit hint — stacked 1s and 0s */}
		<text x="24" y="20" textAnchor="middle" fontFamily="monospace" fontSize="8" fontWeight="bold" fill="currentColor" opacity="0.7">
			101
		</text>
		{/* Clock hands */}
		<path d="M24 24V18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
		<path d="M24 24L28 27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
		{/* Tick marks */}
		<path d="M24 12V14M36 24H34" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.3" />
	</Frame>
);

export const TextDiffIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* Left (removed) column */}
		<path d="M14 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
		<path d="M14 18H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
		<path d="M14 24H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
		{/* Right (added) column */}
		<path d="M26 12H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
		<path d="M26 18H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
		<path d="M26 24H32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
		{/* Center divider */}
		<path d="M24 8V32" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.3" />
		{/* +/- symbols */}
		<text x="16" y="38" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="currentColor" opacity="0.5">
			-
		</text>
		<text x="30" y="38" fontFamily="monospace" fontSize="9" fontWeight="bold" fill="currentColor" opacity="0.8">
			+
		</text>
	</Frame>
);

export const UuidGeneratorIcon = (props: IconProps) => (
	<Frame {...props}>
		{/* UUID hex blocks */}
		<rect x="9" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.7" />
		<rect x="18" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.5" />
		<rect x="27" y="14" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
		<rect x="9" y="23" width="7" height="7" rx="1" fill="currentColor" opacity="0.3" />
		<rect x="18" y="23" width="7" height="7" rx="1" fill="currentColor" opacity="0.5" />
		<rect x="27" y="23" width="7" height="7" rx="1" fill="currentColor" opacity="0.7" />
		{/* Dashes between blocks */}
		<path d="M16.5 17.5H18M25.5 17.5H27M16.5 26.5H18M25.5 26.5H27" stroke="currentColor" strokeWidth="1" opacity="0.4" />
	</Frame>
);

/** Maps app IDs to their icon components */
export const appIcons: Record<string, React.ComponentType<IconProps>> = {
	"github-issue-analyser": GithubFinderIcon,
	"expense-tracker": ExpenseTrackerIcon,
	"nosql-client": NoSqlClientIcon,
	subapp4: SqlClientIcon,
	postman: PostmanIcon,
	"writing-agent": WritingAgentIcon,
	subapp8: KanbanBoardIcon,
	"cron-scheduler": CronTriggerIcon,
	"clock-calendar": ClockCalendarIcon,
	"bookmark-manager": BookmarkManagerIcon,
	"picker-wheel": PickerWheelIcon,
	"json-toolkit": JsonToolkitIcon,
	"pomodoro-timer": PomodoroTimerIcon,
	"regex-tester": RegexTesterIcon,
	"password-generator": PasswordGeneratorIcon,
	"color-palette": ColorPaletteIcon,
	"markdown-previewer": MarkdownPreviewerIcon,
	"epoch-converter": EpochConverterIcon,
	"text-diff": TextDiffIcon,
	"uuid-generator": UuidGeneratorIcon,
};
