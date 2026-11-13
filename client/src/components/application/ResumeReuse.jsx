import { useFetch } from "../../hooks/useFetch";
import { describeApplication, formatShortDate } from "../../utils/format";
import { Select } from "../ui";

/**
 * A list of the résumés already saved (on other applications, and the base
 * one), for "I sent the same résumé as for X". Applications at the same
 * company come first. Calls `onPick` with an application id, or null for the base résumé.
 */
export default function ResumeReuse({ company = "", excludeId, value = "", onPick, disabled, label = "Same résumé as…" }) {
  const applications = useFetch("/applications");
  const profile = useFetch("/profile");

  const same = (application) => application.company.toLowerCase() === company.trim().toLowerCase();
  const withResume = (applications.data?.applications ?? [])
    .filter((application) => application.resume_filename && application.id !== excludeId)
    .sort((a, b) => Number(same(b)) - Number(same(a)) || b.applied_on.localeCompare(a.applied_on));
  const base = profile.data?.resume;

  if (withResume.length === 0 && !base) return null;

  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(event) => onPick(event.target.value === "base" ? null : event.target.value ? Number(event.target.value) : "")}
      aria-label={label}
    >
      <option value="">{label}</option>
      {base && <option value="base">Base résumé · {base.filename}</option>}
      {withResume.map((application) => (
        <option key={application.id} value={application.id}>
          {describeApplication(application)} · {formatShortDate(application.applied_on)} · {application.resume_filename}
        </option>
      ))}
    </Select>
  );
}
