// Structured JSON logs. Lambda's JSON log format adds the timestamp and request ID.
// Personal data is masked before anything is written: CloudWatch logs are readable by
// anyone with console access, and they are not where customer data belongs.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+44|0)\d[\d\s]{8,12}\d/g;

export function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(EMAIL, "<email>").replace(PHONE, "<phone>");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /^(name|email|phone|customer|customerNotes|text)$/i.test(k) ? "<redacted>" : redact(v);
    }
    return out;
  }
  return value;
}

function write(level: "INFO" | "WARN" | "ERROR", msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...(data ? (redact(data) as object) : {}) });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => write("INFO", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("WARN", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("ERROR", msg, data),
};

export function errorInfo(err: unknown): Record<string, unknown> {
  if (err instanceof Error) return { errorName: err.name, errorMessage: err.message };
  return { errorMessage: String(err) };
}
