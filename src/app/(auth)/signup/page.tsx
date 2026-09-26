import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">
          Invitation-only pilot
        </CardTitle>
        <CardDescription>Public signup is not available yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-center">
        <p>
          Contact the person coordinating your pilot to request access. If you
          have been invited, open your invitation link to activate your account.
        </p>
        <Link
          href="/login"
          className="text-blue-600 hover:underline font-medium"
        >
          Already activated? Log in
        </Link>
      </CardContent>
    </Card>
  );
}
