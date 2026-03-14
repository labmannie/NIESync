import Link from "next/link";

const LAST_UPDATED = "March 14, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-campus-black text-white pt-28 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase">Privacy Policy</h1>
        <p className="text-sm text-text-secondary mt-3">NIE Sync | Last updated: {LAST_UPDATED}</p>

        <section className="mt-8 space-y-6 text-sm leading-7 text-white/90">
          <p>
            This Privacy Policy explains how NIE Sync collects, uses, stores, and protects personal data when you use our services.
            NIE Sync is designed for NIE Mysuru students and staff.
          </p>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">1. Data We Collect</h2>
            <p className="mt-2">
              We may collect institutional email, profile details (name, role, batch/year, USN where applicable), phone number,
              vehicle details, account metadata, and session-security data (device, location approximation, and sign-in timestamps).
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">2. Why We Use Data</h2>
            <p className="mt-2">
              We process data to provide authentication, account security, profile management, parking-related verification workflows,
              abuse prevention, and support operations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">3. Legal Basis and Consent</h2>
            <p className="mt-2">
              By signing up and accepting Terms/Privacy, you consent to required processing for platform operation and security.
              Some data is processed for legitimate interests such as fraud prevention and account protection.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">4. Data Sharing</h2>
            <p className="mt-2">
              We do not sell personal data. Data may be processed by infrastructure providers strictly to operate NIE Sync and under
              appropriate contractual and security controls.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">5. Data Retention</h2>
            <p className="mt-2">
              We retain data only as long as necessary for service delivery, security, legal compliance, and dispute resolution.
              Deleted accounts are removed from active systems, subject to minimal retention for security/audit obligations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">6. Your Controls</h2>
            <p className="mt-2">
              You can update profile details, download your data, view session activity, remotely revoke sessions, and request account
              deletion from inside your profile.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">7. Security Measures</h2>
            <p className="mt-2">
              We use authentication controls, session management, row-level access controls, and operational safeguards. No system can
              be guaranteed 100% secure; you are responsible for maintaining device and account hygiene.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">8. Children</h2>
            <p className="mt-2">
              NIE Sync is not intended for children below the age permitted by applicable Indian law for independent digital consent.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">9. Jurisdiction</h2>
            <p className="mt-2">
              This policy is governed by the laws of India, with jurisdiction in Mysuru, Karnataka, subject to mandatory legal rights.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">10. Contact and Team</h2>
            <p className="mt-2">
              NIE Sync is operated by the NIE Sync Core Team:
              Shreyas J, Shreedhar Shivappa Hegade, Ritun Jain, and Shourya Santhosh.
              For privacy requests, contact us through the Contact page.
            </p>
          </div>
        </section>

        <div className="mt-10 text-sm text-text-secondary">
          Read our{" "}
          <Link href="/terms-of-service" className="text-white hover:underline">
            Terms of Service
          </Link>
          {" "}or{" "}
          <Link href="/contact" className="text-white hover:underline">
            contact us
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
