# Interface languages and reminder defaults

Fala 0.14.0 uses the chosen English/Hebrew support language for the complete Android and web interface. The choice is available during sign-in and in Settings, and is saved as `reward_profiles.ui_language`. Hebrew uses RTL layout. Portuguese questions, suggested phrases and answer entry retain LTR layout. Saved conversation translations retain the language in which the conversation was created; opening history does not change the interface language.

`locales/he.json` is the shared UI catalog. English source messages are the keys, with numbered placeholders for variable values. Run `node scripts/localization.mjs` after editing it; this generates the web and Android catalogs. The release build checks that the generated files and placeholders agree. User-entered answers and saved lesson translations are not translated through the UI catalog.

Apply `supabase/migrations/202609250001_language_reminders.sql` before deploying the API. It adds account language and enables daily reminders at 17:00 for new users. Existing disabled reminders receive the new default once; already-enabled custom times are preserved. Rerunning the migration preserves subsequent opt-outs. No push subscription or operating-system permission is fabricated by the migration.

Android asks for notification permission once after a signed-in user reaches Home and the default reminder setting is loaded. The existing scheduler uses the account time zone and skips days with Portuguese practice. Browser users are prompted during their first Talk action when push is configured and supported; existing permission reconnects automatically. Explicit browser disconnection and permission denial are respected. Settings retain manual permission/connect and opt-out controls. Android/iOS/browser delivery can be delayed by the platform; 17:00 is approximate.

Deploying the API/migration changes content and account defaults for existing clients. The complete native interface and automatic Android permission request require the updated Android binary. Local builds and tests do not constitute a Play publication or a production migration.
