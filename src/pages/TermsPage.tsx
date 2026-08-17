import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { publicSupportEmail } from "@/lib/legal/familyBeta";

export default function TermsPage() {
  const supportEmail = publicSupportEmail();
  return (
    <LegalPageShell title="Invite-only beta terms" updated="August 17, 2026">
      <section>
        <h2>Beta participation</h2>
        <p className="mt-2">
          Campus Companion is an early learning tool. Features can change, and occasional errors or downtime are possible. It is not affiliated with or endorsed by a student&apos;s school unless that school says otherwise.
        </p>
      </section>
      <section>
        <h2>Age and supervision</h2>
        <p className="mt-2">
          The student using the account must be at least 13. Do not create or use an account for a child under 13 during this beta. Parents and guardians who create an account for an eligible student are responsible for supervising what the student uploads.
        </p>
      </section>
      <section>
        <h2>Use it as a study aid</h2>
        <p className="mt-2">
          AI can misunderstand a date, topic, or instruction. Review syllabus imports before saving and compare important deadlines with the teacher&apos;s original source. The app does not replace a teacher, counselor, school portal, or official calendar.
        </p>
      </section>
      <section>
        <h2>Appropriate use</h2>
        <ul className="mt-2 space-y-1.5">
          <li>Upload only material you are allowed to use for personal study.</li>
          <li>Do not attempt to access another person&apos;s account or class data.</li>
          <li>Do not use the service to cheat, harass, or distribute harmful or illegal material.</li>
          <li>Keep sign-in information private and tell an adult if the account may be compromised.</li>
        </ul>
      </section>
      <section>
        <h2>Questions</h2>
        <p className="mt-2">
          {supportEmail ? (
            <>Email <a className="text-primary hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</>
          ) : (
            <>Contact the parent, guardian, or beta organizer who invited you. A public support address must be configured before broad registration.</>
          )}
        </p>
      </section>
    </LegalPageShell>
  );
}
