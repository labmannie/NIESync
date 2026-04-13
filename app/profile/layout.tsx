import { ProfileSettingsNav } from "@/app/profile/_components/ProfileSettingsNav";

export default function ProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative bg-campus-black">
      <div className="mx-auto w-full max-w-[1600px] px-3 md:px-5 lg:px-6">
        <div className="pb-10 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-6 xl:gap-8">
          <ProfileSettingsNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
