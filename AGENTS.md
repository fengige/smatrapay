<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Store vending-software-level API configuration in `vending_software_api_settings`, separate from supplier settings, so each platform has one independently secured configuration.
- Cron and retry-job bearer tokens live in the locked-down `cron_settings` table, never in `app_settings` (app_settings has a public anon SELECT policy, so anything stored there is world-readable).
