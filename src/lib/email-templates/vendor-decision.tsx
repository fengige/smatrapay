import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
type Props = { business?: string; reference?: string; reason?: string; setupUrl?: string };
const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
function Decision({ business, reference, reason, setupUrl }: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your SmatraPay vendor application update</Preview>
      <Body style={main}>
        <Container style={{ padding: "32px 24px" }}>
          <Heading>SmatraPay</Heading>
          <Text>
            {business} · Application {reference}
          </Text>
          {setupUrl ? (
            <>
              <Heading as="h2">Your application has been accepted</Heading>
              <Text>
                Set your own password using this secure link. We never send a password by email or
                SMS.
              </Text>
              <Button href={setupUrl}>Set up your password</Button>
              <Text>
                After setting your password, sign in at https://apps.smatrapay.com/login with your
                registered email. If your link expires, select Forgot password on the sign-in page.
              </Text>
            </>
          ) : (
            <>
              <Heading as="h2">Application review completed</Heading>
              <Text>
                Thank you for your interest. We are unable to accept your application at this time.
              </Text>
              <Text>Reason: {reason}</Text>
            </>
          )}
        </Container>
      </Body>
    </Html>
  );
}
export const accepted = {
  component: Decision,
  subject: "SmatraPay vendor application accepted — set up your account",
  displayName: "Vendor accepted / password setup",
  previewData: {
    business: "Example business",
    reference: "SVA-EXAMPLE",
    setupUrl: "https://apps.smatrapay.com/login",
  },
} satisfies TemplateEntry;
export const rejected = {
  component: Decision,
  subject: "Your SmatraPay vendor application review",
  displayName: "Vendor application rejected",
  previewData: {
    business: "Example business",
    reference: "SVA-EXAMPLE",
    reason: "Additional business information is required.",
  },
} satisfies TemplateEntry;
