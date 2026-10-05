import { useCopy } from "@/i18n/copy";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  const copy = useCopy();

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">
          {copy("Invitation-only pilot")}
        </CardTitle>
        <CardDescription>
          {copy("Public signup is not available yet.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-center">
        <p>
          {copy(
            "Contact the person coordinating your pilot to request access. If you have been invited, open your invitation link to activate your account.",
          )}
        </p>
        <Link
          href="/login"
          className="text-blue-600 hover:underline font-medium"
        >
          {copy("Already activated? Log in")}
        </Link>
      </CardContent>
    </Card>
  );
}
