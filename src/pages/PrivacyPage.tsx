import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { publicSupportEmail } from "@/lib/legal/familyBeta";

export default function PrivacyPage() {
  const supportEmail = publicSupportEmail();
  return (
    <LegalPageShell title="Privacy & safety for the family beta" updated="August 17, 2026">
      <section>
        <h2>Who this beta is for</h2>
        <p className="mt-2">
          This is an invite-only learning beta for students age 13 and older. An account may not be created or used for a child under 13 during this beta. Parents and guardians may create and supervise an account for a student who is 13 or older.
        </p>
      </section>
      <section>
        <h2>What the app stores</h2>
        <ul className="mt-2 space-y-1.5">
          <li>Account details such as email, display name, school, and learner type.</li>
          <li>Classes, schedules, homework, quizzes, tests, and study topics you enter or approve.</li>
          <li>Syllabi, notes, photos of class material, extracted concepts, study sets, and study results.</li>
          <li>Basic technical records needed to keep the service secure and working.</li>
        </ul>
      </section>
      <section>
        <h2>How information is used</h2>
        <p className="mt-2">
          Information is used to organize the student&apos;s classes, build their calendar and dashboard, process uploaded class material, generate grounded study activities, and maintain account security. Uploaded class material may be sent to service providers that operate storage, authentication, and AI processing for these features.
        </p>
      </section>
      <section>
        <h2>Student safety</h2>
        <p className="mt-2">
          Do not upload Social Security numbers, medical records, financial information, private messages, or another person&apos;s sensitive information. This beta is a study aid, not an official school record. Students and guardians should verify dates and instructions against the teacher&apos;s original material.
        </p>
      </section>
      <section>
        <h2>Access and deletion</h2>
        <p className="mt-2">
          During the invite-only beta, account review and deletion requests are handled manually. {supportEmail ? (
            <>Email <a className="text-primary hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> from the account email address.</>
          ) : (
            <>Ask the parent, guardian, or beta organizer who invited you. A public privacy contact must be added before registration opens broadly.</>
          )}
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p className="mt-2">
          This notice may change as the beta grows. Material changes should be explained before students are asked to accept a new version.
        </p>
      </section>
    </LegalPageShell>
  );
}
