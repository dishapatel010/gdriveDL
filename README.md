# gdriveDL V1.0
Welcome to gdriveDL V1.0! This application allows you to download files from Google Drive using their API.

## Setup

1. Create a new project in the [Google Developers Console](https://console.developers.google.com/).
2. Under "Credentials", create a new OAuth 2.0 Client ID.
3. Set the "Authorized redirect URIs" field to `https://sub.domain.workers.dev/oauth2/callback`.
4. Click "Create".
5. In `gdriveDL.js`, replace the empty strings in `const CLIENT_ID` and `const CLIENT_SECRET` with your client ID and secret, respectively.
6. Deploy the application to [Cloudflare Workers](https://workers.cloudflare.com/).
7. Congrats! Your gdriveDL instance is now ready to use.

## Usage

Once you have set up your gdriveDL instance, you can start using it to download files from Google Drive. 

### Authenticate

Before downloading files, you will need to authenticate. To do so, visit the authorization URL at `https://your-instance-name.your-account.workers.dev/`.

### Download

To download a file, make a GET request to `https://your-instance-name.your-account.workers.dev/api/v1/download?fileId=[FILE_ID]`. Replace `[FILE_ID]` with the ID of the Google Drive file you want to download.

You may also add an `access_token` parameter to the query string if you already have a valid access token. 

## Notes

- If the user is not authenticated, they will be redirected to the authorization URL.
- If the user is authenticated but the access token has expired, the application will attempt to refresh it using the refresh token.
- If there is an error downloading a file, an error message will be logged in the console.
