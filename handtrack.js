const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const matter = document.getElementById('matter');
  const context = canvas.getContext('2d');

  // flip canvas
  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const offCtx = offscreen.getContext("2d");

  let model = null;

async function startVideo() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === "videoinput");

  let preferredDevice;

  if (videoDevices.length > 1) {
    preferredDevice = videoDevices[videoDevices.length - 1];
  } else {
    preferredDevice = videoDevices[0]; // only one camera available
  }


  const constraints = {
    video: { deviceId: preferredDevice.deviceId ? { exact: preferredDevice.deviceId } : undefined }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}

  function runDetection() {
    offCtx.save();
    offCtx.scale(-1, 1);
    offCtx.drawImage(video, -offscreen.width, 0, offscreen.width, offscreen.height);
    offCtx.restore();

    model.detect(offscreen).then(predictions => {
      console.log("Predictions:", predictions);

      context.drawImage(offscreen, 0, 0);

      // draw prediction bounds
      predictions.forEach(pred => {
        const [x, y, width, height] = pred.bbox;
        context.strokeStyle = "white";
        context.lineWidth = 1;
        context.strokeRect(x, y, width, height);
        context.fillStyle = "white";
        context.fillText(pred.label, x, y > 10 ? y - 5 : y + 10);
      });
    });

    requestAnimationFrame(runDetection);
  }

  handTrack.load().then(lmodel => {
    model = lmodel;
    startVideo().then(() => {
      runDetection();
    });
  });



// matter.js engine stuff
// module aliases
var Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite;

// create an engine
var engine = Engine.create();

// create a renderer
var render = Render.create({
    canvas: matter,
    //element: document.body,
    engine: engine,
    options: {
      width: canvas.width,
      height: canvas.height,
      wireframes: false,   
      background: 'transparent'
    }
});

// create two boxes and a ground
var boxA = Bodies.rectangle(400, 200, 80, 80, {
    render: {
    fillStyle: "red",      // inside color
    strokeStyle: "black",  // outline color
    lineWidth: 2
  }
});

var boxB = Bodies.rectangle(450, 50, 80, 80, {
    render: {
    fillStyle: "red",      // inside color
    strokeStyle: "black",  // outline color
    lineWidth: 2
  }
});

var ground = Bodies.rectangle(0, canvas.height, canvas.width, 60, { isStatic: true });

// run matter engine
Composite.add(engine.world, [boxA, boxB, ground]);
Render.run(render);
var runner = Runner.create();
Runner.run(runner, engine);


// animation helper 
function makeStarburst(x, y, options = {}) {
			return new Promise(resolve => {
				const numLines = options.numLines || 8;
				const maxDistance = options.maxDistance || 40;
				const maxLength = options.maxLength || 15;
				const duration = options.duration || 250; // ms
				const color = options.color || "white";
				const lineWidth = options.lineWidth || 8;

				let startTime = null;

				function draw(progress) {
					ctx.strokeStyle = "white";
					ctx.lineWidth = 4;
					ctx.lineCap = "round";

					// center of the line moves outward
					const centerDist = maxDistance * progress;

					// line length follows a parabola: 0 → max → 0
					const lineLength = maxLength * 4 * progress * (1 - progress);

					for (let i = 0; i < numLines; i++) {
						const angle = (i / numLines) * Math.PI * 2;

						const dist1 = centerDist - lineLength / 2;
						const dist2 = centerDist + lineLength / 2;

						const x1 = cx + Math.cos(angle) * dist1;
						const y1 = cy + Math.sin(angle) * dist1;
						const x2 = cx + Math.cos(angle) * dist2;
						const y2 = cy + Math.sin(angle) * dist2;

						ctx.beginPath();
						ctx.moveTo(x1, y1);
						ctx.lineTo(x2, y2);
						ctx.stroke();
					}
				}

				function animate(timestamp) {
					if (!startTime) startTime = timestamp;
					const elapsed = timestamp - startTime;
					const progress = Math.min(elapsed / duration, 1);

					draw(progress);

					if (progress < 1) {
						requestAnimationFrame(animate);
					} else {
						resolve(); // animation done
					}
				}

				requestAnimationFrame(animate);
			});
		}