/* GLOBAL CONSTANTS AND VARIABLES */

var defaultEye = vec3.fromValues(0, 1.1, 0); // default eye position in world space
var defaultCenter = vec3.fromValues(0, 0, -0.5); // default view direction in world space
// var defaultEye = vec3.fromValues(0, 0.5, 0.4); // default eye position in world space
// var defaultCenter = vec3.fromValues(0, 0, -0.5); // default view direction in world space
var defaultUp = vec3.fromValues(0, 1, 0); // default view up vector
const fov = Math.PI * 0.5; //90 degrees
var rotateTheta = Math.PI / 50; // how much to rotate models by with each key press

/* webgl and geometry data */
var gl = null; // the all powerful gl object. It's all here folks!
var inputTriangles = []; // the triangle data as loaded from input files
var numTriangleSets = 0; // how many triangle sets in input scene
var inputEllipsoids = []; // the ellipsoid data as loaded from input files
var numEllipsoids = 0; // how many ellipsoids in the input scene
var vertexBuffers = []; // this contains vertex coordinate lists by set, in triples
var normalBuffers = []; // this contains normal component lists by set, in triples
var triSetSizes = []; // this contains the size of each triangle set
var triangleBuffers = []; // lists of indices into vertexBuffers by set, in triples
var viewDelta = 0; // how much to displace view with each key press

/* shader parameter locations */
var vPosAttribLoc; // where to put position for vertex shader
var mMatrixULoc; // where to put model matrix for vertex shader
var pvmMatrixULoc; // where to put project model view matrix for vertex shader
var diffuseULoc; // where to put diffuse reflecivity for fragment shader

/* interaction variables */
var Eye = vec3.clone(defaultEye); // eye position in world space
var Center = vec3.clone(defaultCenter); // view direction in world space
var Up = vec3.clone(defaultUp); // view up vector in world space

const noOfBlocks = 15;
const laneSpeed = Array(noOfBlocks)
	.fill(randFloat(0.1, 0.5))
	.map((v, i) => v * (i + 1) * 0.001);
const len = 2;
let blockLength = len / noOfBlocks;

let currentFrogIndex = -1;
let laneMapping = {};
const frogStartXZ = [-0.5 * blockLength, 0.03, -blockLength];
let requestAnimationFrameLoopEnabled = true;
let score = 0;
const livesSpan = document.querySelector('#livesSpan');
const scoreSpan = document.querySelector('#scoreSpan');
const bgmusic = new Audio('./bgmusic.mp3');
const fail = new Audio('./fail.mp3');
const trumpet = new Audio('./trumpet.mp3');
const cheer = new Audio('./cheer');
const jump = new Audio('./jump.mp3');
jump.volume = 1.0;

const theme = {
	default: {
		material: {
			diffuse: [0.5, 0.5, 0.9]
		}
	},
	river: {
		material: {
			diffuse: [0.2, 0.2, 0.9]
		}
	},
	ground: {
		material: {
			diffuse: [0.1, 0.7, 0.2]
		}
	},
	road: {
		material: {
			diffuse: [0.25, 0.25, 0.25]
		}
	},
	frog: {
		material: {
			diffuse: [0.05, 0.25, 0.15]
		}
	},
	wood: {
		material: {
			diffuse: [0.75, 0.45, 0.25]
		}
	},
	random: () => {
		return {
			material: {
				diffuse: [Math.random(), Math.random(), Math.random()]
			}
		};
	},
	landingPad: {
		material: {
			diffuse: [1, 1, 0.1]
		}
	},
	turtle: {
		material: {
			diffuse: [0.458, 0.721, 0.31]
		}
	}
};

// set up the webGL environment
function setupWebGL() {
	// Set up keys
	document.onkeydown = handleKeyDown; // call this when key pressed

	// Get the canvas and context
	var canvas = document.getElementById('myWebGLCanvas'); // create a js canvas
	gl = canvas.getContext('webgl'); // get a webgl object from it

	try {
		if (gl == null) {
			throw 'unable to create gl context -- is your browser gl ready?';
		} else {
			gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
			gl.clearDepth(1.0); // use max when we clear the depth buffer
			gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
		}
	} catch (e) {
		console.log(e);
	} // end catch
} // end setupWebGL

// read models in, load them into webgl buffers
function loadModels() {
	inputTriangles = getSceneModels();
	try {
		if (inputTriangles == String.null) throw 'Unable to load models!';
		else {
			var whichSetVert; // index of vertex in current triangle set
			var whichSetTri; // index of triangle in current triangle set
			var vtxToAdd; // vtx coords to add to the coord array
			var triToAdd; // tri indices to add to the index array
			var maxCorner = vec3.fromValues(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE); // bbox corner
			var minCorner = vec3.fromValues(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE); // other corner

			// process each triangle set to load webgl vertex and triangle buffers
			numTriangleSets = inputTriangles.length; // remember how many tri sets
			for (var whichSet = 0; whichSet < numTriangleSets; whichSet++) {
				// for each tri set
				if (inputTriangles[whichSet].type === 'frog' && inputTriangles[whichSet].lives > 0) {
					currentFrogIndex = whichSet;
				}
				if (inputTriangles[whichSet].type) {
					if (laneMapping[inputTriangles[whichSet].type]) {
						laneMapping[inputTriangles[whichSet].type].push(whichSet);
					} else {
						laneMapping[inputTriangles[whichSet].type] = [whichSet];
					}
				}
				// set up hilighting, modeling translation and rotation
				inputTriangles[whichSet].center = vec3.fromValues(0, 0, 0); // center point of tri set
				inputTriangles[whichSet].on = false; // not highlighted
				inputTriangles[whichSet].translation = vec3.fromValues(0, 0, 0); // no translation
				inputTriangles[whichSet].xAxis = vec3.fromValues(1, 0, 0); // model X axis
				inputTriangles[whichSet].yAxis = vec3.fromValues(0, 1, 0); // model Y axis

				// set up the vertex and normal arrays, define model center and axes
				inputTriangles[whichSet].glVertices = []; // flat coord list for webgl
				var numVerts = inputTriangles[whichSet].vertices.length; // num vertices in tri set
				for (whichSetVert = 0; whichSetVert < numVerts; whichSetVert++) {
					// verts in set
					vtxToAdd = inputTriangles[whichSet].vertices[whichSetVert]; // get vertex to add
					inputTriangles[whichSet].glVertices.push(vtxToAdd[0], vtxToAdd[1], vtxToAdd[2]); // put coords in set coord list
					vec3.max(maxCorner, maxCorner, vtxToAdd); // update world bounding box corner maxima
					vec3.min(minCorner, minCorner, vtxToAdd); // update world bounding box corner minima
					vec3.add(inputTriangles[whichSet].center, inputTriangles[whichSet].center, vtxToAdd); // add to ctr sum
				} // end for vertices in set
				vec3.scale(inputTriangles[whichSet].center, inputTriangles[whichSet].center, 1 / numVerts); // avg ctr sum

				// send the vertex coords and normals to webGL
				vertexBuffers[whichSet] = gl.createBuffer(); // init empty webgl set vertex coord buffer
				gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffers[whichSet]); // activate that buffer
				gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inputTriangles[whichSet].glVertices), gl.STATIC_DRAW); // data in
				normalBuffers[whichSet] = gl.createBuffer(); // init empty webgl set normal component buffer
				gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffers[whichSet]); // activate that buffer
				gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inputTriangles[whichSet].glNormals), gl.STATIC_DRAW); // data in

				// set up the triangle index array, adjusting indices across sets
				inputTriangles[whichSet].glTriangles = []; // flat index list for webgl
				triSetSizes[whichSet] = inputTriangles[whichSet].triangles.length; // number of tris in this set
				for (whichSetTri = 0; whichSetTri < triSetSizes[whichSet]; whichSetTri++) {
					triToAdd = inputTriangles[whichSet].triangles[whichSetTri]; // get tri to add
					inputTriangles[whichSet].glTriangles.push(triToAdd[0], triToAdd[1], triToAdd[2]); // put indices in set list
				} // end for triangles in set

				// send the triangle indices to webGL
				triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichSet]); // activate that buffer
				gl.bufferData(
					gl.ELEMENT_ARRAY_BUFFER,
					new Uint16Array(inputTriangles[whichSet].glTriangles),
					gl.STATIC_DRAW
				); // data in
			} // end for each triangle set
		} // end if triangle file loaded
		// console.log(laneMapping);
	} catch (e) {
		// end try

		console.log(e);
	} // end catch
} // end load models

// setup the webGL shaders
function setupShaders() {
	// define vertex shader in essl using es6 template strings
	var vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        
        uniform mat4 upvmMatrix; // the project view model matrix

        void main(void) {
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);
        }
    `;

	// define fragment shader in essl using es6 template strings
	var fShaderCode = `
        precision mediump float; // set float to medium precision   

        uniform vec3 uDiffuse; // the diffuse reflectivity
            
        void main(void) {
            gl_FragColor = vec4(uDiffuse, 1.0); 
        }
    `;

	try {
		var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
		gl.shaderSource(fShader, fShaderCode); // attach code to shader
		gl.compileShader(fShader); // compile the code for gpu execution

		var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
		gl.shaderSource(vShader, vShaderCode); // attach code to shader
		gl.compileShader(vShader); // compile the code for gpu execution

		if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
			// bad frag shader compile
			throw 'error during fragment shader compile: ' + gl.getShaderInfoLog(fShader);
		} else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
			// bad vertex shader compile
			throw 'error during vertex shader compile: ' + gl.getShaderInfoLog(vShader);
		} else {
			// no compile errors
			var shaderProgram = gl.createProgram(); // create the single shader program
			gl.attachShader(shaderProgram, fShader); // put frag shader in program
			gl.attachShader(shaderProgram, vShader); // put vertex shader in program
			gl.linkProgram(shaderProgram); // link program into gl context

			if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
				// bad program link
				throw 'error during shader program linking: ' + gl.getProgramInfoLog(shaderProgram);
			} else {
				// no shader program link errors
				gl.useProgram(shaderProgram); // activate shader program (frag and vert)

				// locate and enable vertex attributes
				vPosAttribLoc = gl.getAttribLocation(shaderProgram, 'aVertexPosition'); // ptr to vertex pos attrib
				gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array

				// locate vertex uniforms
				mMatrixULoc = gl.getUniformLocation(shaderProgram, 'umMatrix'); // ptr to mmat
				pvmMatrixULoc = gl.getUniformLocation(shaderProgram, 'upvmMatrix'); // ptr to pvmmat

				// locate fragment uniforms
				var lightDiffuseULoc = gl.getUniformLocation(shaderProgram, 'uLightDiffuse'); // ptr to light diffuse
				diffuseULoc = gl.getUniformLocation(shaderProgram, 'uDiffuse'); // ptr to diffuse
			} // end if no shader program link errors
		} // end if no compile errors
	} catch (e) {
		// end try

		console.log(e);
	} // end catch
} // end setup shaders

// render the loaded model
function renderModels() {
	// construct the model transform matrix, based on model state
	function makeModelTransform(currModel) {
		var zAxis = vec3.create(),
			sumRotation = mat4.create(),
			temp = mat4.create(),
			negCtr = vec3.create();

		// move the model to the origin
		mat4.fromTranslation(mMatrix, vec3.negate(negCtr, currModel.center));

		// scale for highlighting if needed
		if (currModel.on) mat4.multiply(mMatrix, mat4.fromScaling(temp, vec3.fromValues(1.2, 1.2, 1.2)), mMatrix); // S(1.2) * T(-ctr)

		// rotate the model to current interactive orientation
		vec3.normalize(zAxis, vec3.cross(zAxis, currModel.xAxis, currModel.yAxis)); // get the new model z axis
		mat4.set(
			sumRotation, // get the composite rotation
			currModel.xAxis[0],
			currModel.yAxis[0],
			zAxis[0],
			0,
			currModel.xAxis[1],
			currModel.yAxis[1],
			zAxis[1],
			0,
			currModel.xAxis[2],
			currModel.yAxis[2],
			zAxis[2],
			0,
			0,
			0,
			0,
			1
		);
		mat4.multiply(mMatrix, sumRotation, mMatrix); // R(ax) * S(1.2) * T(-ctr)

		// translate back to model center
		mat4.multiply(mMatrix, mat4.fromTranslation(temp, currModel.center), mMatrix); // T(ctr) * R(ax) * S(1.2) * T(-ctr)

		// translate model to current interactive orientation
		mat4.multiply(mMatrix, mat4.fromTranslation(temp, currModel.translation), mMatrix); // T(pos)*T(ctr)*R(ax)*S(1.2)*T(-ctr)
	} // end make model transform

	// var hMatrix = mat4.create(); // handedness matrix
	var pMatrix = mat4.create(); // projection matrix
	var vMatrix = mat4.create(); // view matrix
	var mMatrix = mat4.create(); // model matrix
	var pvMatrix = mat4.create(); // hand * proj * view matrices
	var pvmMatrix = mat4.create(); // hand * proj * view * model matrices

	//check for all landings filled case
	if (laneMapping['landingBlockYellow']) {
		const allLandingBlocksCaptured = laneMapping.landingBlockYellow.reduce((res, modelNo) => {
			return inputTriangles[modelNo].type === 'landingBlockYellow' && inputTriangles[modelNo]['captured'] && res;
		}, true);
		if (allLandingBlocksCaptured) {
			cheer.play();
			requestAnimationFrameLoopEnabled = false;
			alert('Congratulations!!! You win :)');
		}
	}

	if (requestAnimationFrameLoopEnabled) {
		requestAnimationFrameLoopEnabled = true;
		window.requestAnimationFrame(renderModels);
	} else {
		alert('Game Over! Refresh the page to start again');
	}

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers

	// set up projection and view
	mat4.perspective(pMatrix, fov, 1, 1e-4, 1e4); // create projection matrix
	mat4.lookAt(vMatrix, Eye, Center, Up); // create view matrix
	mat4.multiply(pvMatrix, pvMatrix, pMatrix); // projection
	mat4.multiply(pvMatrix, pvMatrix, vMatrix); // projection * view

	//check for accidents
	const frogData = inputTriangles[currentFrogIndex];
	const currFrogPosition = vec3.add(
		vec3.create(),
		vec3.fromValues(frogData.bounds.x, frogData.bounds.y, frogData.bounds.z),
		frogData.translation
	);
	const frogsLane = Math.abs(Math.ceil(currFrogPosition[2] / blockLength + (currFrogPosition[2] % blockLength)) + 1);
	// render each triangle set
	var currSet; // the tri set and its material properties
	for (var whichTriSet = 0; whichTriSet < numTriangleSets; whichTriSet++) {
		currSet = inputTriangles[whichTriSet];
		if (currSet.type) {
			const { type, lane, direction } = currSet;
			if (type !== 'frog' && !type.startsWith('landingBlock') && type !== 'river') {
				let step = -direction * laneSpeed[lane];
				if (isOutOfBounds(currSet.bounds.x + currSet.bounds.w + step)) {
					step = currSet.bounds.x > 0 ? -len : len;
					if (frogData['carrier'] === whichTriSet) {
						resetFrog(true);
					}
				}
				vec3.add(currSet.translation, currSet.translation, [step, 0, 0]);
				currSet.bounds.x += step;

				if (frogData['carrier'] === whichTriSet) {
					vec3.add(frogData.translation, frogData.translation, [step, 0, 0]);
					frogData.bounds.x += step;
				}
			}
			//check for collision with frog after taking the step
			if (lane === frogsLane) {
				const collided = collisionDetected(
					currFrogPosition[0],
					frogData.bounds.w,
					currSet.bounds.x,
					currSet.bounds.w,
					direction
				);
				if (collided) {
					switch (type) {
						case 'wood':
							frogData['carrier'] = whichTriSet;
						case 'turtle':
							frogData['carrier'] = whichTriSet;
							break;
						case 'river':
						case 'landingBlockGreen':
						case 'car':
							console.log(`Collision in lane ${frogsLane} with a ${type} and #${whichTriSet}`);
							resetFrog(true);
							break;
					}
				}
			}
		}
		// make model transform, add to view project
		makeModelTransform(currSet);
		mat4.multiply(pvmMatrix, pvMatrix, mMatrix); // project * view * model
		gl.uniformMatrix4fv(pvmMatrixULoc, false, pvmMatrix); // pass in the hpvm matrix

		// reflectivity: feed to the fragment shader
		gl.uniform3fv(diffuseULoc, currSet.material.diffuse); // pass in the diffuse reflectivity

		// vertex buffer: activate and feed into vertex shader
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffers[whichTriSet]); // activate
		gl.vertexAttribPointer(vPosAttribLoc, 3, gl.FLOAT, false, 0, 0); // feed

		// triangle buffer: activate and render
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichTriSet]); // activate
		gl.drawElements(gl.TRIANGLES, 3 * triSetSizes[whichTriSet], gl.UNSIGNED_SHORT, 0); // render
	} // end for each triangle set

	livesSpan.innerText = inputTriangles[currentFrogIndex].lives;
} // end render model

function resetFrog(reduceLife) {
	inputTriangles[currentFrogIndex].translation = vec3.create();
	inputTriangles[currentFrogIndex].bounds = {
		x: frogStartXZ[0],
		y: frogStartXZ[1],
		z: frogStartXZ[2],
		w: blockLength
	};
	inputTriangles[currentFrogIndex]['carrier'] = null;
	console.log('remaining lives', inputTriangles[currentFrogIndex].lives);
	if (reduceLife) {
		fail.play();
		inputTriangles[currentFrogIndex].lives -= 1;
	}
	console.log('remaining lives after', inputTriangles[currentFrogIndex].lives);
	if (inputTriangles[currentFrogIndex].lives <= 0) {
		requestAnimationFrameLoopEnabled = false;
		bgmusic.pause();
	}
}

// does stuff when keys are pressed
function handleKeyDown(event) {
	let currentFrog = inputTriangles[currentFrogIndex];

	switch (event.key) {
		case 'ArrowLeft':
			vec3.add(currentFrog.translation, currentFrog.translation, [-blockLength, 0, 0]);
			jump.play();
			break;
		case 'ArrowRight':
			vec3.add(currentFrog.translation, currentFrog.translation, [blockLength, 0, 0]);
			jump.play();
			break;
		case 'ArrowDown':
			vec3.add(currentFrog.translation, currentFrog.translation, [0, 0, blockLength]);
			jump.play();
			break;
		case 'ArrowUp':
			vec3.add(currentFrog.translation, currentFrog.translation, [0, 0, -blockLength]);
			jump.play();
			break;
	} // end switch

	const { laneNumber, position } = getLaneAndPosition(currentFrogIndex);
	if (laneMapping['landingBlockGreen']) {
		for (let i = 0; i < laneMapping['landingBlockGreen'].length; i++) {
			const modelIndex = laneMapping['landingBlockGreen'][i];
			const greenBlock = inputTriangles[modelIndex];
			const gbLP = getLaneAndPosition(modelIndex);
			if (
				laneNumber > noOfBlocks - 3 &&
				collisionDetected(position[0], currentFrog.bounds.w, gbLP.position[0], greenBlock.bounds.w)
			) {
				resetFrog(true);
				break;
			}
		}
	}

	if (laneMapping['landingBlockYellow']) {
		for (let i = 0; i < laneMapping['landingBlockYellow'].length; i++) {
			const modelIndex = laneMapping['landingBlockYellow'][i];
			const greenBlock = inputTriangles[modelIndex];
			const gbLP = getLaneAndPosition(modelIndex);
			if (
				!greenBlock.captured &&
				laneNumber > noOfBlocks - 3 &&
				collisionDetected(position[0], currentFrog.bounds.w, gbLP.position[0], greenBlock.bounds.w)
			) {
				console.log('reached landing spot');
				inputTriangles[laneMapping['landingBlockYellow'][i]].material = theme.frog.material;
				inputTriangles[laneMapping['landingBlockYellow'][i]].captured = true;
				score += 100;
				trumpet.volume = 1;
				trumpet.play();
				resetFrog(false);
				break;
			}
		}
	}
} // end handleKeyDown

function generateRectangle(topLeft, width, height, plane) {
	// Define vertices
	const vertices = [];
	vertices.push(topLeft.slice()); // Vertex 0

	if (plane === 'XY' || plane === 'XYZ') {
		vertices.push([topLeft[0] + width, topLeft[1], topLeft[2]]); // Vertex 1
		vertices.push([topLeft[0] + width, topLeft[1] - height, topLeft[2]]); // Vertex 2
		vertices.push([topLeft[0], topLeft[1] - height, topLeft[2]]); // Vertex 3
	} else if (plane === 'YZ') {
		vertices.push([topLeft[0], topLeft[1] - height, topLeft[2]]); // Vertex 1
		vertices.push([topLeft[0], topLeft[1] - height, topLeft[2] + width]); // Vertex 2
		vertices.push([topLeft[0], topLeft[1], topLeft[2] + width]); // Vertex 3
	} else if (plane === 'XZ') {
		vertices.push([topLeft[0] + width, topLeft[1], topLeft[2]]); // Vertex 1
		vertices.push([topLeft[0] + width, topLeft[1], topLeft[2] + height]); // Vertex 2
		vertices.push([topLeft[0], topLeft[1], topLeft[2] + height]); // Vertex 3
	} else {
		throw new Error('Invalid plane. Supported values are XY, YZ, XZ, and XYZ.');
	}

	// Define triangles
	const triangles = [
		[0, 1, 2],
		[2, 3, 0]
	];

	return { vertices, triangles, bounds: { x: topLeft[0], y: topLeft[1], z: topLeft[2], w: width } };
}

function getSceneModels() {
	return [
		...generateLandingBlocks(),
		...buildGroundPlaneModels(),
		...generateCars(1, 1),
		...generateCars(2, -1),
		...generateCars(3, 1),
		...generateCars(4, -1),
		...generateCars(5, 1),
		...generateTurtle(Math.ceil(0.5 * noOfBlocks - 1), -1),
		...generateWood(Math.ceil(0.5 * noOfBlocks), -1),
		...generateWood(Math.ceil(0.5 * noOfBlocks + 1), 1),
		...generateTurtle(Math.ceil(0.5 * noOfBlocks + 2), -1),
		...generateWood(Math.ceil(0.5 * noOfBlocks + 3), 1),
		generateFrog()
	];
}

function generateCuboid(topLeft, width, height, depth) {
	// Top and botton faces - XZ
	const xzRect = generateRectangle(topLeft, width, depth, 'XZ');
	const xzOppositeRect = generateRectangle([topLeft[0], topLeft[0] - height, topLeft[2]], width, depth, 'XZ');

	// Front and back faces - XY
	const xyRect = generateRectangle([topLeft[0], topLeft[1], topLeft[2] + depth], width, height, 'XY');
	const xyOppositeRect = generateRectangle(topLeft, width, height, 'XY');

	// Left and right faces - YZ
	const yzRect = generateRectangle(topLeft, depth, height, 'YZ');
	const yzOppositeRect = generateRectangle([topLeft[0] + width, topLeft[1], topLeft[2]], depth, height, 'YZ');

	// Combine vertices and triangles from each rectangle
	const vertices = [
		...xyRect.vertices,
		...xzRect.vertices,
		...yzRect.vertices,
		...xyOppositeRect.vertices,
		...xzOppositeRect.vertices,
		...yzOppositeRect.vertices
	];

	const triangles = [
		...xyRect.triangles,
		...xzRect.triangles.map((t) => t.map((v) => v + xyRect.vertices.length)),
		...yzRect.triangles.map((t) => t.map((v) => v + xyRect.vertices.length + xzRect.vertices.length)),
		...xyOppositeRect.triangles.map((t) =>
			t.map((v) => v + xyRect.vertices.length + xzRect.vertices.length + yzRect.vertices.length)
		),
		...xzOppositeRect.triangles.map((t) =>
			t.map(
				(v) =>
					v +
					// xyRect.vertices.length +
					xzRect.vertices.length +
					yzRect.vertices.length +
					xyOppositeRect.vertices.length
			)
		),
		...yzOppositeRect.triangles.map((t) =>
			t.map(
				(v) =>
					v +
					xyRect.vertices.length +
					xzRect.vertices.length +
					yzRect.vertices.length +
					xyOppositeRect.vertices.length +
					xzOppositeRect.vertices.length
			)
		)
	];

	return { vertices, triangles, bounds: { x: topLeft[0], y: topLeft[1], z: topLeft[2], w: width } };
}

function generateTriangle(topVertex, base, height, plane) {
	// Calculate the other two vertices based on the specified plane
	let leftVertex, rightVertex;

	if (plane === 'XY') {
		leftVertex = [topVertex[0] - base / 2, topVertex[1] - height, topVertex[2]];
		rightVertex = [topVertex[0] + base / 2, topVertex[1] - height, topVertex[2]];
	} else if (plane === 'XZ') {
		leftVertex = [topVertex[0] - base / 2, topVertex[1], topVertex[2] + height];
		rightVertex = [topVertex[0] + base / 2, topVertex[1], topVertex[2] + height];
	} else if (plane === 'YZ') {
		leftVertex = [topVertex[0], topVertex[1] - height, topVertex[2] - base / 2];
		rightVertex = [topVertex[0], topVertex[1] - height, topVertex[2] + base / 2];
	} else {
		throw new Error('Invalid plane. Supported values are XY, XZ, and YZ.');
	}

	// Define vertices
	const vertices = [topVertex, leftVertex, rightVertex];

	// Define triangles
	const triangles = [[0, 1, 2]];

	return { vertices, triangles };
}

function buildGroundPlaneModels() {
	const plane = 'XZ';
	const ground = {
		...generateRectangle([-1, 0, -len + blockLength], len, len - blockLength, plane),
		...theme.road
	};
	const grassStrips = [
		//start strip
		{ ...generateRectangle([-1, 0.002, -blockLength], len, blockLength, plane), ...theme.ground },
		//middle strip
		{
			...generateRectangle([-1, 0.002, -blockLength * Math.floor(noOfBlocks / 2)], 2, blockLength, plane),
			...theme.ground
		}
	];
	const riverLen = blockLength * (Math.floor(noOfBlocks / 2) - 1);
	const riverTopLeft = [-1, 0.002, -len + 2 * blockLength];
	const river = {
		type: 'river',
		...generateRectangle(riverTopLeft, 2, riverLen, plane),
		...theme.river,
		bounds: { x: riverTopLeft[0], y: riverTopLeft[1], z: riverTopLeft[2], w: len }
	};
	return [ground, ...grassStrips, river];
}

function generateLandingBlocks() {
	const blocks = [];

	for (let i = 0, x = -1; x <= 1; i++) {
		let w = i == 0 ? blockLength * 0.5 : blockLength * 2;
		const reach = x + w;
		if (reach >= 1) {
			//cutting off cuboid width so that it does not go out of the ground plane
			w = 1 - x;
		}
		const h = blockLength;
		const d = 2 * blockLength;
		const z = -len;
		const y = i % 2 === 0 ? h : 0.001;
		const bounds = { x, y, z, w };
		if (i % 2 === 0) {
			const cuboid = generateCuboid([x, h, z], w, h, d);
			blocks.push({ type: 'landingBlockGreen', ...cuboid, ...theme.ground, bounds });
		} else {
			blocks.push({
				type: 'landingBlockYellow',
				...generateRectangle([x, y, z], w, d, 'XZ'),
				...theme.landingPad,
				bounds,
				captured: false
			});
		}
		if (reach < 1) x += w;
		else break;
	}
	return blocks;
}

function generateCars(lane, direction, themeOption) {
	if (!themeOption) {
		themeOption = theme.random();
	}
	if (lane < 1) {
		throw new Error('Invalid lane number');
	}
	const z = -blockLength - lane * blockLength;
	const cars = [];
	for (let i = 0, x = direction; i < randInt(1, 3); i++) {
		const w = blockLength * randFloat(1, 2);
		const h = blockLength * randFloat(0.2, 1);
		const d = blockLength;
		cars.push({
			type: 'cars',
			...generateCuboid([x, h, z], w, h, d),
			...themeOption,
			bounds: { x, y: h, z, w },
			lane,
			direction
		});
		if (direction > 0) {
			x += w + randInt(blockLength, 4 * blockLength);
		} else {
			x -= w + randInt(blockLength, 4 * blockLength);
		}
	}
	return [...cars];
}

function generateWood(lane, direction, themeOption) {
	if (!themeOption) {
		themeOption = theme.wood;
	}
	if (lane < 1) {
		throw new Error('Invalid lane number');
	}
	const z = -blockLength - lane * blockLength;
	const woods = [];
	for (let i = 0, x = direction; i < randInt(1, 2); i++) {
		const w = blockLength * 2;
		const h = blockLength / 5;
		const d = blockLength * 0.9;
		woods.push({
			type: 'wood',
			...generateCuboid([x, h, z], w, h, d),
			...themeOption,
			bounds: { x, y: h, z, w },
			lane,
			direction
		});
		if (direction > 0) {
			x += w + randInt(blockLength, 4 * blockLength);
		} else {
			x -= w + randInt(blockLength, 1.5 * blockLength);
		}
	}
	return [...woods];
}

function generateTurtle(lane, direction, themeOption) {
	if (!themeOption) {
		themeOption = theme.turtle;
	}
	if (lane < 1) {
		throw new Error('Invalid lane number');
	}
	const z = -blockLength - lane * blockLength;
	const turtles = [];
	for (let i = 0, x = direction; i < randInt(1, 3); i++) {
		const w = blockLength;
		const h = blockLength / 5;
		const d = blockLength;
		turtles.push({
			type: 'turtles',
			...generateCuboid([x, h, z], w, h, d),
			...themeOption,
			bounds: { x, y: h, z, w },
			lane,
			direction
		});
		if (direction > 0) {
			x += w + randInt(blockLength, 4 * blockLength);
		} else {
			x -= w + randInt(blockLength, 4 * blockLength);
		}
	}
	return [...turtles];
}

function generateFrog(x, z) {
	const triangle = generateTriangle(frogStartXZ, blockLength, blockLength, 'XZ');
	return {
		type: 'frog',
		lives: 5,
		alive: true,
		...triangle,
		...theme.frog,
		bounds: { x: frogStartXZ[0], y: frogStartXZ[1], z: frogStartXZ[2], w: blockLength }
	};
}

function isOutOfBounds(v) {
	return v < -1 || v > 1;
}

function collisionDetected(x1, w1, x2, w2, direction = -1) {
	const length1 = x1 + w1;
	const length2 = x2 + w2;
	return (x1 <= length2 && x1 >= x2) || (length1 >= x2 && x2 >= x1);
}

function getLaneAndPosition(modelIndex) {
	const { bounds, translation } = inputTriangles[modelIndex];
	const position = vec3.add(vec3.create(), vec3.fromValues(bounds.x, bounds.y, bounds.z), translation);
	const laneNumber = Math.abs(Math.ceil(position[2] / blockLength + (position[2] % blockLength)) + 1);
	return { position, laneNumber };
}

function randInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
	return Math.random() * (max - min) + min;
}

function main() {
	setupWebGL(); // set up the webGL environment
	loadModels(); // load in the models from tri file
	setupShaders(); // setup the webGL shaders
	bgmusic.addEventListener('ended', () => {
		bgmusic.play();
	});
	bgmusic.volume = 0.09;
	fail.volume = 1;
	bgmusic.play();
	renderModels(); // draw the triangles using webGL
} // end main

main();
