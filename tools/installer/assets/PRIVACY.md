PRIVACY POLICY

GD LEVEL REQUEST BOT Supernova Software, LLC

Effective as of the date of your first installation or use of the Software.

This Privacy Policy explains what data Supernova Software, LLC ("Supernova,"
"we," "us," or "our") collects in connection with GD Level Request Bot, including its desktop application, licensing
service, marketplace, and authentication broker (collectively, the "Software"), why we collect it, how long we keep it,
and the rights available to you under the EU/UK General Data Protection Regulation ("GDPR") and comparable laws. Terms
not defined here have the meaning given in the Terms of Service.

This Policy covers the services Supernova operates directly. It does not cover Connected Platforms (Twitch, YouTube,
Google, Geometry Dash's servers)
— each has its own privacy practices, governed by its own policy, outside Supernova's control.

1. CONTROLLER AND CONTACT

Supernova Software, LLC is the controller of the personal data described in this Policy. Questions, access requests, and
erasure requests may be sent to privacy@supers0ft.us.

2. DATA COLLECTED BY THE LICENSING SERVICE

When you sign in with GitHub to obtain a license token, the licensing service collects and stores:

- Your numeric GitHub user ID (a pseudonymous identifier).
- Your GitHub username.
- Whether your GitHub account sponsors Supernova3339 at or above the configured minimum tier, and the sponsorship amount
  in cents.
- Timestamps of your first and most recent sign-in.

Your GitHub OAuth access token is used only for the duration of the sign-in request — to read your public profile and,
where relevant, your sponsorship status — and is never written to disk or database. We do not collect your email address
or IP address as part of this record.

Legal basis: legitimate interest and, where a paid license is involved, performance of a contract with you (GDPR Art. 6
(1)(b)/ (f)).

3. DATA COLLECTED BY THE MARKETPLACE SERVICE

The marketplace is a separate service and database from licensing, sharing only your GitHub ID and username, synced at
each sign-in. It additionally stores, where applicable to your activity:

- Your marketplace role (user, author, staff, or admin), which governs what you're permitted to do in the marketplace
  (see the Terms of Service).
- Packages you submit for publication (metadata you provide: name, description, version, download source), linked to
  your GitHub ID as the submitter.
- Reviews you write (star rating and review text), linked to your GitHub ID and username.
- Helpful/unhelpful votes you cast on other users' reviews.
- Reports you file against a package or review (reason, optional details), linked to your GitHub ID as the reporter, and
  reports other users file that staff review as part of moderation.

Legal basis: legitimate interest in operating a moderated marketplace (GDPR Art. 6 (1)(f)), and contract performance
where your submission is the basis of a listing.

4. DATA NOT STORED

We do not store: GitHub OAuth access tokens (beyond the single request that uses them), your email address, or your IP
address, in either the licensing or marketplace database. Rate limiting is performed transiently in server memory and is
not persisted.

5. LOCAL DEVICE DATA

Separately from the services above, the Software stores data locally on your device — OAuth tokens for Connected
Platforms, queue and viewer data, an encrypted representation of your Geometry Dash credentials, installed marketplace
content, and any data a script you run chooses to persist. This local data is not transmitted to Supernova except where
a specific feature (e.g. installing a marketplace package, verifying your license) requires it, and is governed by
Section 7 of the Terms of Service. Uninstalling the Software does not automatically delete data already sent to a
Connected Platform or to a Supernova-operated service.

6. RETENTION

Licensing records are retained for up to 730 days (2 years) from your last sign-in; a background process periodically
purges records past that window. Marketplace records (reviews, votes, submitted packages, filed reports)
persist until you request erasure or, for packages/reports, indefinitely as community content and moderation history
(see Section 8 — erasure unlinks your identity from these records rather than deleting the records themselves, where
they constitute content or history involving other users).

7. YOUR RIGHTS

Under GDPR you have the right to:

- **Access (Art. 15).** Request a copy of the data we hold on you, across both the licensing and marketplace databases.
  In the app or via the API, this is `POST /api/gdpr/export` with your license token.
- **Erasure (Art. 17).** Request deletion of your data. In the app or via the API, this is `POST /api/gdpr/erase` with
  your license token. This:
    - Deletes your licensing record.
    - Deletes your marketplace user record.
    - Deletes reviews you've written and votes you've cast (each affected package's displayed rating is recalculated
      immediately afterward).
    - Retains reports you've filed, but removes the link to your identity — the report content itself is kept as trust &
      safety history, which is a legitimate interest that survives your erasure request.
    - Retains packages you've submitted, since other users may have installed them, but removes the link identifying you
      as the submitter.

  Owner accounts (the small set of accounts operating the service) cannot self-erase through this endpoint, since doing
  so would remove the service's own administrative access; contact us directly for that case.
- **Rectification.** If any data we hold about you (e.g. a synced username)
  is inaccurate, it is corrected automatically on your next sign-in, or you may contact us.
- **Objection / restriction.** You may object to processing based on legitimate interest, or request restriction, by
  contacting us; we will evaluate the request against the legal bases above.
- **Complaint.** You have the right to lodge a complaint with your local data protection supervisory authority.

8. INTERNATIONAL TRANSFERS

Data described in this Policy is stored on servers operated by Supernova Software, LLC. Where a transfer outside the
EU/EEA is involved, we rely on appropriate safeguards required by applicable law.

9. CHANGES TO THIS POLICY

We may update this Policy from time to time. Material changes will be reflected by an updated effective date. Continued
use of the Software after a change takes effect constitutes acceptance of the updated Policy, to the same extent
described for the Terms of Service.

10. CONTACT

Questions or requests concerning this Policy, or the data described in it, may be directed to privacy@supers0ft.us.
