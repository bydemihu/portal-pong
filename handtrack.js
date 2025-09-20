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