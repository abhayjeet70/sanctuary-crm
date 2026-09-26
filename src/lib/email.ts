/**
 * One definition of "a usable email address", used by every form that asks
 * for one — so the popup, the admin dialogs and sign-up cannot disagree.
 *
 * Practical rather than exhaustive: a local part, an @, and a domain made of
 * dot-separated labels ending in a 2+ letter extension (.com, .in, .co.uk).
 * That is what stops "sam@", "sam@gmail", "sam @gmail.com" and "sam@gmail..com"
 * — the mistakes people actually make — without rejecting real addresses.
 */
const SHAPE =
  /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * Well-formed but almost certainly a slip: the domain is one keystroke away
 * from a mailbox provider everybody uses. A confirmation sent to "gmial.com"
 * goes nowhere and the guest never knows why.
 */
const TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmaill.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.in": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.con": "icloud.com",
};

/** Whether the address is well formed. Empty is not valid — see `emailProblem`. */
export const isValidEmail = (value: string): boolean => {
  const v = value.trim();
  return v.length <= 254 && SHAPE.test(v) && !v.includes("..");
};

/**
 * What is wrong with an address, in words a guest can act on — or null when
 * it is fine. `required: false` lets an empty field through, so optional
 * fields only complain when something has actually been typed.
 */
export function emailProblem(value: string, { required = true }: { required?: boolean } = {}): string | null {
  const v = value.trim();
  if (!v) return required ? "Enter your email address." : null;
  if (/\s/.test(v)) return "An email address can't contain spaces.";
  if (!v.includes("@")) return "An email address needs an @ — like name@gmail.com.";
  if (v.indexOf("@") !== v.lastIndexOf("@")) return "An email address can only have one @.";
  const [local, domain] = v.split("@");
  if (!local) return "Add the part before the @ — like name@gmail.com.";
  if (!domain) return "Add the part after the @ — like name@gmail.com.";
  if (!domain.includes(".")) return `“${domain}” is incomplete — did you mean ${domain}.com?`;
  if (!isValidEmail(v)) return "That doesn't look like a valid email — check it, like name@gmail.com.";
  const suggestion = TYPOS[domain.toLowerCase()];
  if (suggestion) return `Did you mean ${local}@${suggestion}? “${domain}” looks like a typo.`;
  return null;
}
