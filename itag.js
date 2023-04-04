addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const itagResolutionMap = {
  '5': '240', '6': '270', '17': '144', '18': '360', '22': '720', '34': '360', '35': '480',
  '36': '240', '37': '1080', '38': '3072', '43': '360', '44': '480', '45': '720', '46': '1080',
  '82': '360 [3D]', '83': '480 [3D]', '84': '720 [3D]', '85': '1080p [3D]', '100': '360 [3D]',
  '101': '480 [3D]', '102': '720 [3D]', '92': '240', '93': '360', '94': '480', '95': '720',
  '96': '1080', '132': '240', '151': '72', '133': '240', '134': '360', '135': '480',
  '136': '720', '137': '1080', '138': '2160', '160': '144', '264': '1440',
  '298': '720', '299': '1080', '266': '2160', '167': '360', '168': '480', '169': '720',
  '170': '1080', '218': '480', '219': '480', '242': '240', '243': '360', '244': '480',
  '245': '480', '246': '480', '247': '720', '248': '1080', '271': '1440', '272': '2160',
  '302': '2160', '303': '1080', '308': '1440', '313': '2160', '315': '2160', '59': '480'
};

async function handleRequest(request) {
  const file_id = new URL(request.url).searchParams.get('file_id');
  if (!file_id) {
    return new Response('Error: missing file_id parameter', {status: 400});
  }

  let accessTokenInfo = getAccessToken(request);
  if (accessTokenInfo === null) {
    const newAccessToken = await refreshAccessToken(R_TOKEN);
    accessTokenInfo = newAccessToken;
  }

  // Access token is still valid
  const acc_token = accessTokenInfo.access_token;

  const isVideo = await isVideoFile(acc_token, file_id);

  if (isVideo) {
    // Perform both direct and transcoded downloads
    const directUrl = await getDirectDownloadUrl(acc_token, file_id);
    const transcodedUrls = await getTranscodedDownloadUrls(acc_token, file_id);

    if (directUrl === null && Object.keys(transcodedUrls).length === 0) {
      return new Response('Failed to retrieve download link T', {status: 400});
    }

    let downloadButtons = '';
    if (directUrl) {
      downloadButtons += `<div style="margin-bottom: 10px;"><a href="${directUrl.downloadUrl}">Download Direct</a></div>`;
    }
    for (const itag in transcodedUrls) {
      const url = transcodedUrls[itag].url;
      const resolution = transcodedUrls[itag].resolution;
      downloadButtons += `<div style="margin-bottom: 10px;"><a href="${url}">Download ${resolution}p</a></div>`;
    }
    const Responsex = new Response(generateHtml(downloadButtons, directUrl.title));
    Responsex.headers.append('Set-Cookie', `access_token=${acc_token}; path=/; HttpOnly; SameSite=Strict`);
    Responsex.headers.set('Content-Type', 'text/html');
    return Responsex
  } else {
    // Perform direct download only
    const url = await getDirectDownloadUrl(acc_token, file_id);
    if (!url) {
      return new Response('FaiIled to retrieve download link', {status: 400});
    }
    let downloadButtons = '';
    downloadButtons += `<div style="margin-bottom: 10px;"><a href="${url.downloadUrl}">Download Direct</a></div>`;
    const Responsex = new Response(generateHtml(downloadButtons, url.title));
    Responsex.headers.append('Set-Cookie', `access_token=${acc_token}; path=/; HttpOnly; SameSite=Strict`);
    Responsex.headers.set('Content-Type', 'text/html');
    return Responsex
  }
}

async function isVideoFile(access_token, file_id) {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=name,mimeType`, {
      headers: {
        "Authorization": `Bearer ${access_token}`
      }
    });
    const json = await response.text();
    const parsedJson = JSON.parse(json);
    if (parsedJson.mimeType && parsedJson.mimeType.startsWith('video/')) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}

async function getDirectDownloadUrl(acc_token, file_id) {
  // Check file existence and access
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=name`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${acc_token}`
    }
  });

  // Get direct download URL and file name
  const session = {
    access_token: acc_token,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "refresh_token": REFRESH_TOKEN,
    "token_expiry": "",
  };
  if (!resp.ok) {
    return null;
  }
  const jsonx = await resp.text();
  const parsedJson = JSON.parse(jsonx);
  session.url = `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`;
  const sessionB64 = btoa(JSON.stringify(session));
  const downloadUrl = `https://sub.domain.workers.dev/api/v1/download?session=${sessionB64}`;

  // Extract the file name from the response JSON
  const title = parsedJson.name;

  // Return an object with the title and download URL
  return { title, downloadUrl };
}

async function getTranscodedDownloadUrls(acc_token, file_id) {
  const response = await fetch(`https://drive.google.com/get_video_info?docid=${file_id}`, {
    headers: {
      "Authorization": `Bearer ${acc_token}`
    }
  });
  const video_info = await response.text();
  const video_params = new URLSearchParams(video_info);
  const urls = [];

  if (video_params.has('url_encoded_fmt_stream_map')) {
    urls.push(...video_params.get('url_encoded_fmt_stream_map').split(','));
  }
  if (video_params.has('adaptive_fmts')) {
    urls.push(...video_params.get('adaptive_fmts').split(','));
  }

  const session = {
    access_token: acc_token,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "refresh_token": REFRESH_TOKEN,
    "token_expiry": "",
  };
  const transcodedUrls = {};
  for (const urlString of urls) {
    const url = new URLSearchParams(urlString);
    const itag = url.get('itag');
    const resolution = itagResolutionMap[itag] || 'Unknown';
    session.url = `${url.get('url')}&${url.get('s') || url.get('sig')}`;
    session.cookie = response.headers.get('set-cookie');
    session.transcoded = true;
    const sessionB64 = btoa(JSON.stringify(session));
    const downloadUrl = `https://sub.domain.workers.dev/api/v1/download?session=${sessionB64}`;
    transcodedUrls[itag] = {
        url: downloadUrl,
        resolution: resolution,
        transcoded: true,
      };
  }
  return transcodedUrls;
}

function generateHtml(downloadButtons, title) {
    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      body {
        font-family: sans-serif;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      h1 {
        margin-top: 0;
      }
      .download-links {
        display: flex;
        flex-wrap: wrap;
        margin: 20px 0;
      }
      .download-links a {
        display: inline-block;
        margin-right: 10px;
        margin-bottom: 10px;
        padding: 10px;
        background-color: #4CAF50;
        color: white;
        text-decoration: none;
        border-radius: 4px;
      }
      .download-links a:hover {
        background-color: #3e8e41;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${title}</h1>
      <p>Click below to Download</p>
      <div class="download-links">
        ${downloadButtons}
      </div>
    </div>
  </body>
</html>`;
  }

function enQuery(data) {
    const ret = [];
    for (let d in data) {
      ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
    }
    return ret.join("&");
  }

function getAccessToken(request) {
    const url = new URL(request.url);
    const cookieHeader = request.headers.get('Cookie');
    let accessToken = null;
    let accessTokenExpiresIn = null;
    if (cookieHeader !== null && cookieHeader.includes('access_token=')) {
        const cookies = cookieHeader.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'access_token') {
                accessToken = value;
            }
        }
    }
    if (accessToken !== null) {
        return { access_token: accessToken };
    }
    return null;
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
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: headers, body: body });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Error refreshing access token: ${json.error}`);
  }
  return {
    access_token: json.access_token,
    expires_in: json.expires_in
  };
}
