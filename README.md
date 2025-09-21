# Portal Pong!
### Collaborative physical gameplay across the world

Click on the image below to watch a showcase!
[![Watch the video](https://img.youtube.com/vi/zV2nIdfLm1U/maxresdefault.jpg)](https://youtu.be/zV2nIdfLm1U)

## Inspiration
Portal Pong was inspired by interactive public art installations such as Portal (NYC-Dublin) and immersive physical games such as projection-mapped rock climbing. 

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
