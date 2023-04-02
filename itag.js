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

  // Fetch a new access token
  const token_url = "https://oauth2.googleapis.com/token";
  const headers = {"Content-Type": "application/x-www-form-urlencoded"};

  const data = {
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "refresh_token": REFRESH_TOKEN,
    "grant_type": "refresh_token",
  };

  const token_response = await fetch(token_url, {
    method: "POST",
    headers: headers,
    body: enQuery(data),
  });

  const token_data = await token_response.json();

  // Construct the session object using the new access token
  const session = {
    access_token: "",
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "refresh_token": REFRESH_TOKEN,
    "token_expiry": "",
  };

  session.url = `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`;
  session.access_token = token_data.access_token;
  const sessionB64 = btoa(JSON.stringify(session));
  const directUrl = `https://sub.domain.workers.dev/api/v1/download?session=${sessionB64}`;
  const response = await fetch(`https://drive.google.com/get_video_info?docid=${file_id}`, {
    headers: {
      "Authorization": `Bearer ${session.access_token}`
    }
  });
  const video_info = await response.text();
  const video_params = new URLSearchParams(video_info);

  if (video_params.get('status') !== 'ok') {
    return new Response('Error: failed to get video info', {status: 400});
  }

  let urls = [];
  if (video_params.has('url_encoded_fmt_stream_map')) {
    urls = urls.concat(video_params.get('url_encoded_fmt_stream_map').split(','));
  }
  if (video_params.has('adaptive_fmts')) {
    urls = urls.concat(video_params.get('adaptive_fmts').split(','));
  }

  const transcodedUrls = {};
  urls.forEach(urlString => {
    const url = new URLSearchParams(urlString);
    const itag = url.get('itag');
    const resolution = itagResolutionMap[itag] || 'Unknown';
    session.url = `${url.get('url')}&${url.get('s') || url.get('sig')}`;
    session.cookie = response.headers.get('set-cookie');
    session.transcoded = true;
    const sessionB64 = btoa(JSON.stringify(session));
    transcodedUrls[itag] = {
      url: `https://sub.domain.workers.dev/api/v1/download?session=${sessionB64}`,
      resolution: resolution,
      transcoded: true,
    };
  });

  const body = JSON.stringify({
    title: decodeURIComponent(video_params.get('title') || ''),
    directUrl: directUrl,
    results: transcodedUrls,
  });

  return new Response(body, {headers: {'Content-Type': 'application/json'}});
}

function enQuery(data) {
    const ret = [];
    for (let d in data) {
      ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
    }
    return ret.join("&");
  }
