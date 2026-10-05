import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50">
      <div className="absolute top-4 end-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-md p-4">{children}</div>
    </div>
  );
}
