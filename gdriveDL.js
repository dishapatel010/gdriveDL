/*
gdriveDL V1.0
MIT License

Copyright (c) 2023 IsThisUser

*/
// Constants
const CLIENT_ID = '';
const CLIENT_SECRET = '';
const REDIRECT_URI = 'https://sub.domain.workers.dev/oauth2/callback';
const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/drive';

// Handle incoming requests
addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/oauth2/callback')) {
    event.respondWith(handleCallback(event.request));
  } else {
    event.respondWith(handleRequest(event.request));
  }
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // If the user is not authenticated, redirect them to the authorization page
  if (!isAuthenticated(request)) {
    const authorizationUrl = await getAuthorizationUrl();
    return Response.redirect(authorizationUrl, 302);
  }

  // If the request is just for the root path, provide some basic info about available downloads
  if (path === '/') {
    const responseBody = {
      message: 'You are logged in! Here are some available api routes',
      download: '/api/v1/download?fileId=xxx'
    };
    const response = new Response(JSON.stringify(responseBody));
    response.headers.set('Content-Type', 'application/json');
    return response;
  }

  // If the user is authenticated and requesting a file download, download the file using their access token
  if (path.toLowerCase().startsWith('/api/v1/download')) {
    const fileId = url.searchParams.get('fileId');
    const accessToken = url.searchParams.get('access_token') || getToken(request).access_token;
    const drive = new googleDrive(accessToken);
    if (accessToken !== null) {
      return await drive.downloadFile(fileId, accessToken);
    }
  }

  // If the request doesn't match any of the above handlers, return a 404 response
  return new Response('Not Found', { status: 404 });
}

async function handleCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code !== null && code !== undefined) {
    const accessToken = await getAccessToken(code);
    const responseBody = {
      access_token: accessToken.access_token,
      expires_in: accessToken.expires_in,
      refresh_token: accessToken.refresh_token
    };
    const response = new Response(JSON.stringify(responseBody));
    const accessTokenExpiration = Date.now() + accessToken.expires_in * 1000;
    response.headers.set('Set-Cookie', `access_token=${accessToken.access_token}; Secure; HttpOnly; SameSite=None; Expires=${new Date(accessTokenExpiration).toUTCString()}; Path=/`);
    const refreshTokenExpiration = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
    response.headers.append('Set-Cookie', `refresh_token=${accessToken.refresh_token}; Secure; HttpOnly; SameSite=None; Expires=${new Date(refreshTokenExpiration).toUTCString()}; Path=/`);
    response.headers.set('Content-Type', 'application/json');
    return response;
  } else {
    return new Response('Authorization failed', { status: 401 });
  }
}

// Returns true if the request has an authenticated user, false otherwise
function isAuthenticated(request) {
  const token = getToken(request);
  return token !== null && token !== undefined;
}

// Gets the access token from the request headers or cookies, if present
function getToken(request) {
  const url = new URL(request.url);
  const accessTokenFromQuery = url.searchParams.get('access_token');
  if (accessTokenFromQuery !== null) {
    return { access_token: accessTokenFromQuery };
  }
  const authorizationHeader = request.headers.get('Authorization');
  if (authorizationHeader !== null && authorizationHeader.startsWith('Bearer ')) {
    const accessToken = authorizationHeader.substring('Bearer '.length);
    return { access_token: accessToken };
  } else {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader !== null && cookieHeader.includes('access_token=')) {
      const cookies = cookieHeader.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'access_token') {
          return { access_token: value };
        }
      }
    }
    return null;
  }
}

// Gets the URL of the Authorization endpoint to redirect users to for authentication
async function getAuthorizationUrl() {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.append('client_id', CLIENT_ID);
  url.searchParams.append('redirect_uri', REDIRECT_URI);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('scope', SCOPES);
  url.searchParams.append('access_type', 'offline');
  url.searchParams.append('prompt', 'consent');
  return url.toString();
}

// Exchanges an authorization code for an access token and refresh token
async function getAccessToken(authorizationCode) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, // Use REDIRECT_URI directly
    code: authorizationCode
  });
  const response = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: headers, body: body });
  const json = await response.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in
  };
}

// Refreshes the access token using the provided refresh token
async function refreshAccessToken(refreshToken) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken
  });
  const response = await fetch(TOKEN_ENDPOINT, { method: 'POST', headers: headers, body: body });
  const json = await response.json();
  return {
    access_token: json.access_token,
    expires_in: json.expires_in
  };
}

// Downloads a file from Google Drive using the specified access token and file ID
class googleDrive {
  constructor(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async downloadFile(fileId) {
    try {
      const requestOption = {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.accessToken}` }
      };
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, requestOption);
      if (response.status === 401 && this.refreshToken !== undefined) {
        // Access token has expired, try refreshing it with the refresh token
        const newAccessToken = await refreshAccessToken(this.refreshToken);
        this.accessToken = newAccessToken.access_token;
        console.log(`Access token refreshed, new expiration: ${newAccessToken.expires_in} seconds`);
        // Retry the file download with the new access token
        const requestOption = {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.accessToken}` }
        };
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, requestOption);
        return response;
      }
      return response;
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
}
