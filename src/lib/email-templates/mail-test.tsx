import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
}

const MailTestEmail = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>SmatraPay mail configuration test</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Mail configuration test</Heading>
        <Text style={text}>{name ? `Hi ${name},` : "Hi there,"}</Text>
        <Text style={text}>
          This is a test message from your SmatraPay mail configuration. If you
          received it, outgoing email is working correctly.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          SmatraPay · Sent from the Mail Configuration page
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: MailTestEmail,
  subject: "SmatraPay mail configuration test",
  displayName: "Mail configuration test",
  previewData: { name: "Jane" },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "20px 25px" };
const heading = { fontSize: "20px", color: "#0f172a" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "22px" };
const hr = { borderColor: "#e2e8f0", margin: "20px 0" };
const footer = { fontSize: "12px", color: "#94a3b8" };
