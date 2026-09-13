import React from 'react'

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h2>
    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{children}</div>
  </div>
)

export default function Privacy() {
  return (
    <div style={{ flex: 1, padding: '32px 20px 60px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>StoryDream Privacy Policy</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32 }}>Last updated: [DATE — fill in when published]</p>

      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: 24 }}>
        StoryDream ("we", "us", "the App") creates personalised, illustrated bedtime stories starring characters you provide, using photos you upload. This policy explains what information we collect, how we use it, and who we share it with.
      </p>

      <Section title="Who this is for">
        StoryDream accounts are intended to be created and managed by adults. If you upload a photo of a child as a "character," you confirm that you are that child's parent or guardian, or otherwise have the right and appropriate consent to upload their photo for this purpose. Children themselves are not intended to create or manage their own StoryDream accounts.
      </Section>

      <Section title="Information we collect">
        <p><strong>Account information.</strong> When you sign in with Google, we receive your name, email address, and profile picture from Google. We do not receive or store your Google password.</p>
        <p><strong>Character photos and details.</strong> When you create a character, we store the photo you upload, along with any name, age, personality, or description you provide. These photos are used to generate story illustrations featuring that character.</p>
        <p><strong>Story content.</strong> The stories you create — including the text, generated illustrations, and narration audio — are stored so you can read them again later.</p>
        <p><strong>Billing information.</strong> If you subscribe to a paid plan, payment is processed directly by Stripe, our payment provider. We do not receive or store your card number — we only receive confirmation of your subscription status (which plan, whether it's active) from Stripe.</p>
        <p><strong>Usage information.</strong> We track how many stories and characters you've created, to apply the limits associated with your plan.</p>
      </Section>

      <Section title="How we use this information">
        <p>We use the information above to:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Create and let you sign in to your account</li>
          <li>Generate the story text, illustrations, narration, and sound effects you request</li>
          <li>Let you use characters shared with you by other users you've connected with</li>
          <li>Apply the usage limits and features associated with your subscription plan</li>
          <li>Process payments and manage your subscription</li>
          <li>Respond to support requests</li>
        </ul>
      </Section>

      <Section title="Third parties we share information with">
        <p>To provide the service, some of your information is sent to the following providers, solely for the purpose of generating and hosting your content:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li><strong>Google</strong> — for sign-in authentication</li>
          <li><strong>OpenAI</strong> — character photos and story descriptions are sent to generate story text, illustrations, and narration audio</li>
          <li><strong>ElevenLabs</strong> — scene descriptions (text only, not photos) are sent to generate sound effects</li>
          <li><strong>Supabase</strong> — our database provider, which stores your account, character, and story data</li>
          <li><strong>Amazon Web Services (AWS)</strong> — stores uploaded photos and generated images/audio files</li>
          <li><strong>Stripe</strong> — processes payments for paid subscriptions</li>
          <li><strong>Vercel</strong> — hosts the application itself</li>
        </ul>
        <p style={{ marginTop: 8 }}>We do not sell your personal information, and we do not share your photos or story content with any party other than those listed above, which are necessary to operate the service.</p>
      </Section>

      <Section title="Sharing with other users">
        If you choose to connect with another StoryDream user (via the Friends feature) and they accept, their characters become available for you to use in your own stories, and vice versa. You can see who you're connected to, and this sharing only happens after both people have explicitly agreed to the connection.
      </Section>

      <Section title="Data retention and deletion">
        We retain your account, character, and story data for as long as your account is active. If you'd like your account and associated data deleted, contact us at the email below and we will process your request.
      </Section>

      <Section title="Your rights">
        You can contact us at any time to ask what information we hold about you, correct it, or request its deletion.
      </Section>

      <Section title="Children's privacy">
        StoryDream does not knowingly collect personal information directly from children, and accounts are intended to be held by adults. Photos of children may be uploaded by a parent or guardian as part of creating a "character" for a story, as described above.
      </Section>

      <Section title="Security">
        We use industry-standard measures (encrypted connections, access-controlled databases, and row-level security on our database) to protect your information, but no method of storage or transmission is 100% secure.
      </Section>

      <Section title="Changes to this policy">
        If we make material changes to this policy, we'll update the date at the top of this page.
      </Section>

      <Section title="Contact us">
        For any questions about this policy or your data, contact us at <a href="mailto:jessie@orkaittech.com" style={{ color: '#7F77DD' }}>jessie@orkaittech.com</a>.
      </Section>
    </div>
  )
}
