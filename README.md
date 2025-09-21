# Portal Pong!
### Collaborative physical gameplay across the world

<img width="1341" height="198" alt="portal-dark" src="https://github.com/user-attachments/assets/7f3a3d65-6d34-4808-b1dd-1f7fc5d9aa8f" />

Click on the image below to watch a showcase!
[![Watch the video](https://img.youtube.com/vi/zV2nIdfLm1U/maxresdefault.jpg)](https://youtu.be/zV2nIdfLm1U)

## Inspiration
Portal Pong was inspired by interactive public art installations such as Portal (NYC-Dublin) and immersive physical games such as projection-mapped rock climbing. We were inspired by the public nature of art installations and how they tranformed the built environment into opportunities for entertainment. We were also inspired by the creative applications of physical interactivity for digital media, like alternative game controllers and hand and body-based gestures--the blending of physical and digital allows for exciting developments beyond traditional models of interaction like keyboards.

## What it does
Portal Pong links together two public street-level camera feeds from different locations, putting the videos side by side like a portal into another place. It detects and tracks people's hands from the camera feeds. People from one location can then interact with people in the other location by playing pong, using their hands to hit a digital ball from one side to the other, allowing for a friendly physical game that transcends space. 

## How we built it
We prototyped the UI in Figma then built it with HTML and CSS. We initially used TensorFlow JS for hand recognition then switched to Google's MediaPipe later. We used Cloudflare SFU to manage WebRTC for video calling, and did a simple lobby system using Websockets.

## Challenges we ran into
One major challenge was dealing with lag. With running edge compute like hand recognition, and then delivering that over the internet, it could lead to some delays. This took a lot of time to deal with.

## Accomplishments that we're proud of
We are extremely proud of making the entire app in under a day and a half and having a blast while doing it. 

## What's next for Portal Pong!
We'd love to build out a real installation in the wild! Portal Pong is already fun to play, and we imagine it can be an amazing tool to connect people around the world through physical gameplay. 

Click on the image below to watch the demo!
[![Watch the video](https://img.youtube.com/vi/hozZVQrWQ-Y/maxresdefault.jpg)](https://youtu.be/hozZVQrWQ-Y)

# Setting it up yourself

### NodeJS Signaling Server + Cloudflare SFU Server + Client Browser

You can clone this repo, and run `npm install` to install all the required packages.

Then you can run the signaling server with `node server.mjs` which will start on port 8080.

**IMPORTANT: There are 3 fill-in-the-blanks in the `src/main.js` file which relate to a Cloudflare SFU App ID, Cloudflare SFU App Token, and Signaling Server URL.**

We use Cloudflare SFU to relay our video streaming over the internet, you will need to create a new [Realtime SFU app](https://developers.cloudflare.com/realtime/sfu/) and get the app ID and app TOKEN which can be replaced in the `src/main.js` file. There is also a input URL you must provide with `wss://` prepended. This is the URL of the signaling server that is running on port 8080. Remember to remove any "https://" or "http://" on this signaling server URL since we are using it as a websocket (hence the wss://).

The client browser can be ran with `npm run dev` and will start a client session on port 5173.

We recommend creating temporary tunnels with `cloudflared --url` on any and all of the localhost URLs to poke a hole through any and all firewalls and immediately test out the app with anyone in the entire world! :)

### Questions

If you have any questions, please feel free to reach out to Demi at dh785@cornell.edu or Sean at shl225@cornell.edu 
