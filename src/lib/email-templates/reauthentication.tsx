import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '560px', borderTop: '4px solid #C2661F' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#10262C',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#4B5A5E',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#10262C',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#8A9296', margin: '30px 0 0' }
