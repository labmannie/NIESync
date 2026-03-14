import Link from "next/link";

const LAST_UPDATED = "March 14, 2026";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-campus-black text-white pt-28 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase">Terms of Service</h1>
        <p className="text-sm text-text-secondary mt-3">NIE Sync | Last updated: {LAST_UPDATED}</p>

        <section className="mt-8 space-y-6 text-sm leading-7 text-white/90">
          <p>
            These Terms of Service ("Terms") govern your access to and use of NIE Sync, available at
            {" "}
            <a className="underline" href="https://niesync.vercel.app" target="_blank" rel="noreferrer">
              niesync.vercel.app
            </a>
            . By creating an account or using NIE Sync, you agree to these Terms.
          </p>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">1. Eligibility</h2>
            <p className="mt-2">
              NIE Sync is intended only for The National Institute of Engineering (NIE), Mysuru students and staff using valid
              `@nie.ac.in` identities. Group emails and shared aliases are not permitted for individual accounts.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">2. Account Responsibilities</h2>
            <p className="mt-2">
              You are responsible for safeguarding your account, device access, and any activity performed under your account.
              You must provide accurate profile information and promptly update details when they change.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">3. Acceptable Use</h2>
            <p className="mt-2">
              You agree not to misuse NIE Sync, including impersonation, unauthorized access attempts, abuse of parking identity
              workflows, scraping, harassment, or any unlawful activity.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">4. Content and Data</h2>
            <p className="mt-2">
              You retain responsibility for the data you submit. NIE Sync may process account, profile, and session-security data
              for authentication, safety, fraud prevention, and platform operations.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">5. Suspension and Termination</h2>
            <p className="mt-2">
              We may suspend, restrict, or terminate access at our discretion for policy violations, abuse, security risk, or
              institutional compliance requirements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">6. Disclaimer of Warranties</h2>
            <p className="mt-2">
              NIE Sync is provided on an "as is" and "as available" basis without warranties of uninterrupted operation, merchantability,
              or fitness for a particular purpose.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">7. Limitation of Liability</h2>
            <p className="mt-2">
              To the maximum extent permitted under applicable law, NIE Sync and its team are not liable for indirect, incidental,
              special, consequential, or punitive damages arising from use of the platform.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">8. Indemnity</h2>
            <p className="mt-2">
              You agree to defend and indemnify NIE Sync and its contributors against claims, losses, and liabilities resulting from
              your misuse of the service or violation of these Terms.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">9. Governing Law and Jurisdiction</h2>
            <p className="mt-2">
              These Terms are governed by the laws of India. Courts in Mysuru, Karnataka, India will have exclusive jurisdiction,
              subject to applicable mandatory consumer protections.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold uppercase tracking-wider">10. Team and Contact</h2>
            <p className="mt-2">
              NIE Sync is built and operated by the NIE Sync Core Team:
              Shreyas J, Shreedhar Shivappa Hegade, Ritun Jain, and Shourya Santhosh.
              For policy questions, use the Contact page.
            </p>
          </div>
        </section>

        <div className="mt-10 text-sm text-text-secondary">
          Read our{" "}
          <Link href="/privacy-policy" className="text-white hover:underline">
            Privacy Policy
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
