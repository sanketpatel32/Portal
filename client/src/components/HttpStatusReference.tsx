import { Search, Globe } from "lucide-react";
import { useMemo } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { cn } from "@/lib/utils";
import { AppInput } from "./ui/AppInput";
import { CopyButton } from "./ui/CopyButton";
import { EmptyState } from "./ui/EmptyState";
import { ModuleHeaderBar } from "./ui/ModuleHeaderBar";

type Props = { onBack: () => void };

const STATUS_CODES = [
	// 1xx
	{ code: 100, name: "Continue", category: "1xx", desc: "The server has received the request headers and the client should proceed to send the request body." },
	{ code: 101, name: "Switching Protocols", category: "1xx", desc: "The requester has asked the server to switch protocols and the server has agreed." },
	{ code: 102, name: "Processing", category: "1xx", desc: "The server has received and is processing the request, but no response is available yet." },
	{ code: 103, name: "Early Hints", category: "1xx", desc: "Used to return some response headers before the final HTTP message." },
	// 2xx
	{ code: 200, name: "OK", category: "2xx", desc: "Standard response for successful HTTP requests." },
	{ code: 201, name: "Created", category: "2xx", desc: "The request has been fulfilled and a new resource has been created." },
	{ code: 202, name: "Accepted", category: "2xx", desc: "The request has been accepted for processing but is not complete." },
	{ code: 203, name: "Non-Authoritative Information", category: "2xx", desc: "The server is a transforming proxy that received a 200 OK but is returning a modified version." },
	{ code: 204, name: "No Content", category: "2xx", desc: "The server successfully processed the request and is not returning any content." },
	{ code: 205, name: "Reset Content", category: "2xx", desc: "The server asks the client to reset the document view." },
	{ code: 206, name: "Partial Content", category: "2xx", desc: "The server is delivering only part of the resource due to a range header." },
	{ code: 207, name: "Multi-Status", category: "2xx", desc: "The message body is XML containing multiple separate response codes." },
	{ code: 208, name: "Already Reported", category: "2xx", desc: "Used in DAV to avoid enumerating the same member repeatedly." },
	{ code: 226, name: "IM Used", category: "2xx", desc: "The server has fulfilled a GET request and the response represents the result of instance-manipulations." },
	// 3xx
	{ code: 300, name: "Multiple Choices", category: "3xx", desc: "Indicates multiple options for the resource from which the client may choose." },
	{ code: 301, name: "Moved Permanently", category: "3xx", desc: "This and all future requests should be directed to the given URI." },
	{ code: 302, name: "Found", category: "3xx", desc: "Tells the client to look at another URL for the resource (temporary redirect)." },
	{ code: 303, name: "See Other", category: "3xx", desc: "The response can be found under another URI using the GET method." },
	{ code: 304, name: "Not Modified", category: "3xx", desc: "The resource has not been modified since the version specified by the request headers." },
	{ code: 305, name: "Use Proxy", category: "3xx", desc: "The requested resource is available only through a proxy." },
	{ code: 307, name: "Temporary Redirect", category: "3xx", desc: "Repeat the request to another URI; same method must be used." },
	{ code: 308, name: "Permanent Redirect", category: "3xx", desc: "Use the same method to repeat the request to another URI, permanently." },
	// 4xx
	{ code: 400, name: "Bad Request", category: "4xx", desc: "The server cannot process the request due to a client error (malformed syntax)." },
	{ code: 401, name: "Unauthorized", category: "4xx", desc: "Authentication is required and has failed or has not been provided." },
	{ code: 402, name: "Payment Required", category: "4xx", desc: "Reserved for future use, sometimes used for payment-gated content." },
	{ code: 403, name: "Forbidden", category: "4xx", desc: "The request was valid but the server is refusing action." },
	{ code: 404, name: "Not Found", category: "4xx", desc: "The requested resource could not be found." },
	{ code: 405, name: "Method Not Allowed", category: "4xx", desc: "The request method is not supported for the requested resource." },
	{ code: 406, name: "Not Acceptable", category: "4xx", desc: "The requested resource can only generate content not acceptable per the Accept headers." },
	{ code: 407, name: "Proxy Authentication Required", category: "4xx", desc: "The client must first authenticate itself with the proxy." },
	{ code: 408, name: "Request Timeout", category: "4xx", desc: "The server timed out waiting for the request." },
	{ code: 409, name: "Conflict", category: "4xx", desc: "The request could not be processed because of conflict in the current state of the resource." },
	{ code: 410, name: "Gone", category: "4xx", desc: "The resource is no longer available and will not be available again." },
	{ code: 411, name: "Length Required", category: "4xx", desc: "The request did not specify the length of its content, which is required." },
	{ code: 412, name: "Precondition Failed", category: "4xx", desc: "The server does not meet one of the preconditions in the request headers." },
	{ code: 413, name: "Payload Too Large", category: "4xx", desc: "The request is larger than the server is willing or able to process." },
	{ code: 414, name: "URI Too Long", category: "4xx", desc: "The URI provided was too long for the server to process." },
	{ code: 415, name: "Unsupported Media Type", category: "4xx", desc: "The request entity has a media type the server does not support." },
	{ code: 416, name: "Range Not Satisfiable", category: "4xx", desc: "The client asked for a portion of the file that the server cannot supply." },
	{ code: 417, name: "Expectation Failed", category: "4xx", desc: "The server cannot meet the requirements of the Expect request-header field." },
	{ code: 418, name: "I'm a Teapot", category: "4xx", desc: "The server refuses to brew coffee because it is, permanently, a teapot." },
	{ code: 421, name: "Misdirected Request", category: "4xx", desc: "The request was directed at a server that is not able to produce a response." },
	{ code: 422, name: "Unprocessable Entity", category: "4xx", desc: "The request was well-formed but unable to be followed due to semantic errors." },
	{ code: 423, name: "Locked", category: "4xx", desc: "The resource that is being accessed is locked." },
	{ code: 424, name: "Failed Dependency", category: "4xx", desc: "The request failed due to failure of a previous request." },
	{ code: 425, name: "Too Early", category: "4xx", desc: "The server is unwilling to risk processing a request that might be replayed." },
	{ code: 426, name: "Upgrade Required", category: "4xx", desc: "The client should switch to a different protocol." },
	{ code: 428, name: "Precondition Required", category: "4xx", desc: "The origin server requires the request to be conditional." },
	{ code: 429, name: "Too Many Requests", category: "4xx", desc: "The user has sent too many requests in a given amount of time (rate limiting)." },
	{ code: 431, name: "Request Header Fields Too Large", category: "4xx", desc: "The server is unwilling to process the request because its header fields are too large." },
	{ code: 451, name: "Unavailable For Legal Reasons", category: "4xx", desc: "The resource is unavailable due to legal demands (e.g. government censorship)." },
	// 5xx
	{ code: 500, name: "Internal Server Error", category: "5xx", desc: "A generic error message; server encountered an unexpected condition." },
	{ code: 501, name: "Not Implemented", category: "5xx", desc: "The server does not recognize the request method, or lacks the ability to fulfill it." },
	{ code: 502, name: "Bad Gateway", category: "5xx", desc: "The server received an invalid response from an upstream server." },
	{ code: 503, name: "Service Unavailable", category: "5xx", desc: "The server is currently unavailable (overloaded or down for maintenance)." },
	{ code: 504, name: "Gateway Timeout", category: "5xx", desc: "The upstream server failed to send a request in time." },
	{ code: 505, name: "HTTP Version Not Supported", category: "5xx", desc: "The server does not support the HTTP protocol version used in the request." },
	{ code: 506, name: "Variant Also Negotiates", category: "5xx", desc: "Transparent content negotiation results in a circular reference." },
	{ code: 507, name: "Insufficient Storage", category: "5xx", desc: "The server is unable to store the representation needed to complete the request." },
	{ code: 508, name: "Loop Detected", category: "5xx", desc: "The server detected an infinite loop while processing the request." },
	{ code: 510, name: "Not Extended", category: "5xx", desc: "Further extensions to the request are required for the server to fulfill it." },
	{ code: 511, name: "Network Authentication Required", category: "5xx", desc: "The client needs to authenticate to gain network access (e.g. captive portal)." },
];

const CATEGORIES = ["all", "1xx", "2xx", "3xx", "4xx", "5xx"] as const;

const CATEGORY_LABELS: Record<string, string> = {
	all: "All",
	"1xx": "1xx Informational",
	"2xx": "2xx Success",
	"3xx": "3xx Redirection",
	"4xx": "4xx Client Error",
	"5xx": "5xx Server Error",
};

const CATEGORY_COLORS: Record<string, string> = {
	"1xx": "text-blue-400 border-blue-500/30 bg-blue-500/5",
	"2xx": "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
	"3xx": "text-amber-400 border-amber-500/30 bg-amber-500/5",
	"4xx": "text-orange-400 border-orange-500/30 bg-orange-500/5",
	"5xx": "text-red-400 border-red-500/30 bg-red-500/5",
};

export const HttpStatusReference: React.FC<Props> = ({ onBack }) => {
	const [search, setSearch] = usePersistentState("auraflow_http_search", "");
	const [category, setCategory] = usePersistentState<string>("auraflow_http_cat", "all");

	const filtered = useMemo(() => {
		return STATUS_CODES.filter((s) => {
			if (category !== "all" && s.category !== category) return false;
			if (search) {
				const q = search.toLowerCase();
				return String(s.code).includes(q) || s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
			}
			return true;
		});
	}, [search, category]);

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2 animate-scale-up">
			<ModuleHeaderBar title="HTTP Status Reference" subtitle="Every status code — searchable and copyable" onBack={onBack} backLabel="Home" />

			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" strokeWidth={1.5} />
				<AppInput
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by code, name, or description..."
					aria-label="Search status codes"
					className="pl-9"
				/>
			</div>

			<div className="flex flex-wrap gap-2">
				{CATEGORIES.map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => setCategory(c)}
						className={cn(
							"border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer select-none",
							category === c
								? "border-white/40 bg-white/10 text-white"
								: "border-white/10 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
						)}
					>
						{CATEGORY_LABELS[c]}
					</button>
				))}
			</div>

			{filtered.length === 0 ? (
				<EmptyState icon={<Globe className="size-7 text-zinc-600" />} message="No status codes match your search" />
			) : (
				<div className="flex flex-col gap-2">
					{filtered.map((s) => (
						<div key={s.code} className="flex items-start gap-3 border border-white/10 px-3 py-2.5">
							<div className={cn("flex size-12 shrink-0 items-center justify-center border font-mono text-sm font-bold", CATEGORY_COLORS[s.category])}>
								{s.code}
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium">{s.name}</p>
								<p className="text-xs text-zinc-500">{s.desc}</p>
							</div>
							<CopyButton text={`${s.code} ${s.name}`} />
						</div>
					))}
				</div>
			)}
		</div>
	);
};
