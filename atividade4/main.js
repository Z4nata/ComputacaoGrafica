const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}

const vertexShaderSource = `#version 300 es

in vec2 aPosition;

uniform mat3 u_viewTransform;
uniform mat3 u_modelTransform;

void main() {

    vec3 position =
        u_viewTransform *
        u_modelTransform *
        vec3(aPosition, 1.0);

    gl_Position =
        vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es

precision mediump float;

uniform vec3 uColor;

out vec4 outColor;

void main() {

    outColor =
        vec4(uColor, 1.0);
}
`;

function createShader(gl, type, source) {

    const shader =
        gl.createShader(type);

    gl.shaderSource(
        shader,
        source
    );

    gl.compileShader(shader);

    if (
        !gl.getShaderParameter(
            shader,
            gl.COMPILE_STATUS
        )
    ) {

        const error =
            gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(error);
    }

    return shader;
}

function createProgram(
    gl,
    vertexShaderSource,
    fragmentShaderSource
) {

    const vertexShader =
        createShader(
            gl,
            gl.VERTEX_SHADER,
            vertexShaderSource
        );

    const fragmentShader =
        createShader(
            gl,
            gl.FRAGMENT_SHADER,
            fragmentShaderSource
        );

    const program =
        gl.createProgram();

    gl.attachShader(
        program,
        vertexShader
    );

    gl.attachShader(
        program,
        fragmentShader
    );

    gl.linkProgram(program);

    if (
        !gl.getProgramParameter(
            program,
            gl.LINK_STATUS
        )
    ) {

        throw new Error(
            gl.getProgramInfoLog(program)
        );
    }

    return program;
}


const program =
    createProgram(
        gl,
        vertexShaderSource,
        fragmentShaderSource
    );


// ==================================================
// CLASSE RENDERER
// ==================================================

class Renderer {

    constructor(gl, program) {
        this.gl = gl;
        this.program = program;

        this.positionLocation =
            gl.getAttribLocation(
                program,
                "aPosition"
            );

        this.colorLocation =
            gl.getUniformLocation(
                program,
                "uColor"
            );

        this.viewTransformLocation =
            gl.getUniformLocation(
                program,
                "u_viewTransform"
            );

        this.modelTransformLocation =
            gl.getUniformLocation(
                program,
                "u_modelTransform"
            );

        this.viewTransform =
            m3.identity();

        this.verticesBuffer =
            gl.createBuffer();
    }

    defineViewTransform(viewTransform) {
        this.viewTransform =
            viewTransform;
    }

    draw(object) {
        const gl = this.gl;

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            this.verticesBuffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            object.vertices,
            gl.STATIC_DRAW
        );

        gl.enableVertexAttribArray(
            this.positionLocation
        );

        gl.vertexAttribPointer(
            this.positionLocation,
            2,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.uniform3fv(
            this.colorLocation,
            object.color
        );

        gl.uniformMatrix3fv(
            this.modelTransformLocation,
            false,
            object.modelTransform
        );

        gl.uniformMatrix3fv(
            this.viewTransformLocation,
            false,
            this.viewTransform
        );

        gl.drawArrays(
            gl.TRIANGLES,
            0,
            object.vertices.length / 2
        );
    }
}

// ==================================================
// AUXILIARY FUNCTIONS
// ==================================================

function rectangleVertices(x,y,width,height){
    return [
        x, y,
        x+width, y+height,
        x, y+height,

        x, y,
        x+width, y,
        x+width, y+height
    ];
}

function circleVertices(radius,numSegments){
    const vertices = [];

    for (let i = 0; i < numSegments; i++) {
        const theta1 =
            (i / numSegments) *
            2 * Math.PI;

        const theta2 =
            ((i + 1) / numSegments) *
            2 * Math.PI;


        vertices.push(
            0,
            0
        );

        vertices.push(
            radius * Math.cos(theta1),
            radius * Math.sin(theta1)
        );


        vertices.push(
            radius * Math.cos(theta2),
            radius * Math.sin(theta2)
        );
    }

    return vertices;
}

// ==================================================
// ROBOT VERTICES
// ==================================================

function robotHeadVertices() {

    const vertices = rectangleVertices(-0.15,0.4,0.3,0.3);

    return new Float32Array(vertices);
}

function robotBodyVertices() {

    const vertices = rectangleVertices(-0.25,-0.2,0.5,0.6);

    return new Float32Array(vertices);
}

// braço e perna começam no ponto (0,0), que é onde ficam presos
// no corpo, assim eles giram em volta do ombro e do quadril

function robotArmVertices() {

    const vertices = rectangleVertices(-0.05,-0.4,0.1,0.4);

    return new Float32Array(vertices);
}

function robotLegVertices() {

    const vertices = rectangleVertices(-0.06,-0.5,0.12,0.5);

    return new Float32Array(vertices);
}


// ==================================================
// CLASSE SCENE OBJECT
// ==================================================

class SceneObject {

    constructor(vertices, color) {

        this.vertices = vertices;

        this.color = color; 

        this.modelTransform = m3.identity();
    }

    updateModelTransform(modelTransform) {

        this.modelTransform = modelTransform;
    }
}


// ==================================================
// CLASSE ROBOT HEAD
// ==================================================

class RobotHead extends SceneObject {

    constructor() {

        super(

            robotHeadVertices(),

            new Float32Array([
                0.7,
                0.7,
                0.7
            ])
        );
    }
}


// ==================================================
// CLASSE ROBOT BODY
// ==================================================

class RobotBody extends SceneObject {

    constructor() {

        super(

            robotBodyVertices(),

            new Float32Array([
                0.2,
                0.4,
                0.9
            ])
        );
    }
}


// ==================================================
// CLASSE ROBOT ARM
// ==================================================
// o braço gira sem parar, igual a roda do carro

class RobotArm extends SceneObject {

    constructor(xPosition, angularSpeed) {

        super(

            robotArmVertices(),

            new Float32Array([
                0.9,
                0.6,
                0.1
            ])
        );

        this.xPosition = xPosition;

        this.theta = 0.0;

        this.angularSpeed = angularSpeed;
    }


    updateRotation() {

        this.theta += this.angularSpeed;
    }


    updateModelTransform(robotModelTransform) {

        const localTransform =

            m3.multiply(
                m3.translation(this.xPosition,0.35),
                m3.rotation(this.theta)
            );

        this.modelTransform =

            m3.multiply(
                robotModelTransform,
                localTransform
            );
    }
}


// ==================================================
// CLASSE ROBOT LEG
// ==================================================
// a perna balança para um lado e para o outro: quando passa do
// limite, a velocidade troca de sinal e ela volta

class RobotLeg extends SceneObject {

    constructor(xPosition, angularSpeed) {

        super(

            robotLegVertices(),

            new Float32Array([
                0.5,
                0.5,
                0.5
            ])
        );

        this.xPosition = xPosition;

        this.theta = 0.0;

        this.angularSpeed = angularSpeed;
    }


    updateRotation() {

        this.theta += this.angularSpeed;

        if ( this.theta > 0.3 || this.theta < -0.3) {

            this.angularSpeed = -this.angularSpeed;
        }
    }


    updateModelTransform(robotModelTransform) {

        const localTransform =

            m3.multiply(
                m3.translation(this.xPosition,-0.2),
                m3.rotation(this.theta)
            );

        this.modelTransform =

            m3.multiply(
                robotModelTransform,
                localTransform
            );
    }
}


// ==================================================
// CLASSE ROBOT
// ==================================================
// o robô sobe e desce, os braços giram e as pernas balançam

class Robot {

    constructor(tx, ty, speed) {

        this.tx = tx;

        this.ty = ty;

        this.speed = speed;

        this.robotHead = new RobotHead();

        this.robotBody = new RobotBody();

        this.leftArm = new RobotArm(-0.3,-0.05);

        this.rightArm = new RobotArm(0.3,0.05);

        this.leftLeg = new RobotLeg(-0.13,0.01);

        this.rightLeg = new RobotLeg(0.13,0.01);
    }

    animate() {

        this.ty += this.speed;

        if ( this.ty > 0.2 || this.ty < -0.2) {

            this.speed = -this.speed;
        }

        const robotTransform = m3.translation(this.tx,this.ty);

        this.robotHead.updateModelTransform(robotTransform);

        this.robotBody.updateModelTransform(robotTransform);

        this.leftArm.updateRotation();

        this.rightArm.updateRotation();

        this.leftLeg.updateRotation();

        this.rightLeg.updateRotation();

        this.leftArm.updateModelTransform(robotTransform);

        this.rightArm.updateModelTransform(robotTransform);

        this.leftLeg.updateModelTransform(robotTransform);

        this.rightLeg.updateModelTransform(robotTransform);
    }

    draw(renderer) {

        renderer.draw(this.leftLeg);

        renderer.draw(this.rightLeg);

        renderer.draw(this.robotBody);

        renderer.draw(this.robotHead);

        renderer.draw(this.leftArm);

        renderer.draw(this.rightArm);
    }
}


// ==================================================
// CLASSE SCENE
// ==================================================

class Scene {

    constructor(gl, program) {

        this.renderer = new Renderer(gl,program);

        this.viewTransform = m3.setClippingWindow(-2.0,-1.0,2.0,1.0);

        this.renderer.defineViewTransform(this.viewTransform);

        this.robot = new Robot(0.0,0.0,0.005);
    }

    update() {

        this.robot.animate();
    }

    draw() {

        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        this.robot.draw(this.renderer);
    }

    execute() {

        this.update();

        this.draw();

        requestAnimationFrame(() => this.execute());
    }

    init() {

        requestAnimationFrame(() => this.execute());
    }
}


// ==================================================
// CONFIGURAÇÃO INICIAL DO WEBGL
// ==================================================

gl.clearColor(
    0.1,
    0.1,
    0.1,
    1.0
);

gl.viewport(
    0,
    0,
    canvas.width,
    canvas.height
);


// ==================================================
// CRIAR CENA
// ==================================================

const scene =
    new Scene(gl,program);


// ==================================================
// INICIAR ANIMAÇÃO
// ==================================================

scene.init();