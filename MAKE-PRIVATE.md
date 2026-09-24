# Make Mimir-MVP1 private

The GitHub connector cannot flip visibility. Do this once in the browser:

1. Open https://github.com/BabyBlaxk/Mimir-MVP1/settings
2. Scroll to **Danger Zone**
3. **Change repository visibility** → **Private** → confirm
4. Confirm you still see the repo while logged in as BabyBlaxk
5. On the VPS, clone with SSH or a personal access token — public HTTPS clone will stop working after this

Leave `Mimir-core-MVP1` archived. Do not put `.env` or `mimir.sqlite` in git.
