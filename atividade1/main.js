// --------------------------------------------------
// 0. CONTEXTO
// --------------------------------------------------
// O canvas trabalha em COORDENADAS DE PIXEL, igual ao
// gluOrtho2D(0, largura, 0, altura) do OpenGL:
// (0, 0) é o canto inferior esquerdo e (599, 599) o superior
// direito. Bresenham só faz sentido com pixel inteiro, então
// é esse o sistema usado do começo ao fim.

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}


// --------------------------------------------------
// 1. CORES INDEXADAS (teclas 0 a 9)
// --------------------------------------------------

const CORES = [
    [0.20, 0.39, 1.00],   // 0 - azul
    [1.00, 0.24, 0.24],   // 1 - vermelho
    [0.24, 0.80, 0.35],   // 2 - verde
    [1.00, 0.82, 0.24],   // 3 - amarelo
    [1.00, 0.63, 0.20],   // 4 - laranja
    [0.65, 0.47, 1.00],   // 5 - roxo
    [0.20, 0.84, 0.84],   // 6 - ciano
    [1.00, 0.41, 0.71],   // 7 - rosa
    [1.00, 1.00, 1.00],   // 8 - branco
    [0.55, 0.59, 0.71]    // 9 - cinza
];

const FUNDO = [0.08, 0.09, 0.12];


// --------------------------------------------------
// 2. ESTADO DA RETA
// --------------------------------------------------
// A reta inicial vai de (0, 0) a (0, 0) e é azul — como são
// o mesmo ponto, Bresenham acende um único pixel, no canto
// inferior esquerdo da tela.

let xInicial = 0;
let yInicial = 0;
let xFinal = 0;
let yFinal = 0;

let cor = CORES[0];

// guarda o primeiro clique até o segundo chegar
let esperandoSegundoClique = false;
let xClicado = 0;
let yClicado = 0;


// --------------------------------------------------
// 3. VERTEX SHADER
// --------------------------------------------------
// Converte pixel (0 a 600) para clip space (-1 a 1) e desenha
// cada ponto com 1 pixel de tamanho.
//
// O "+ 0.5" joga o ponto para o CENTRO do pixel. Sem ele, o
// ponto cai bem na divisa entre quatro pixels, pinta um
// pedaço de cada um e a reta aparece apagada.

const vertexShaderSource = `#version 300 es

in vec2 aPosition;

uniform vec2 uResolution;

void main() {
    vec2 zeroAUm = (aPosition + 0.5) / uResolution;
    vec2 clip = zeroAUm * 2.0 - 1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 1.0;
}

`;


// --------------------------------------------------
// 4. FRAGMENT SHADER
// --------------------------------------------------

const fragmentShaderSource = `#version 300 es

precision mediump float;

uniform vec3 uColor;

out vec4 outColor;

void main() {
    outColor = vec4(uColor, 1.0);
}

`;


// --------------------------------------------------
// 5. COMPILAR SHADERS
// --------------------------------------------------

function createShader(gl, type, source) {

    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);

    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

        const error = gl.getShaderInfoLog(shader);

        gl.deleteShader(shader);

        throw new Error(error);
    }

    return shader;
}


const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    vertexShaderSource
);

const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource
);


// --------------------------------------------------
// 6. CRIAR PROGRAMA
// --------------------------------------------------

const program = gl.createProgram();

gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);

gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {

    throw new Error(
        gl.getProgramInfoLog(program)
    );
}


// --------------------------------------------------
// 7. BUFFER E ATRIBUTO
// --------------------------------------------------
// O buffer é criado uma vez só; a cada reta nova ele é
// reescrito com os pixels calculados por Bresenham.

const buffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

const positionLocation = gl.getAttribLocation(program, "aPosition");

gl.enableVertexAttribArray(positionLocation);

gl.vertexAttribPointer(
    positionLocation,
    2,
    gl.FLOAT,
    false,
    0,
    0
);

const resolutionLocation = gl.getUniformLocation(program, "uResolution");
const colorLocation = gl.getUniformLocation(program, "uColor");


// --------------------------------------------------
// 8. ALGORITMO DE BRESENHAM
// --------------------------------------------------
// Devolve a lista de pixels da reta usando SÓ inteiros:
// nada de divisão, ponto flutuante ou equação da reta.
//
// A variável "erro" mede o quanto o pixel escolhido está
// afastado da reta ideal. A cada passo ela decide se o
// próximo pixel anda em x, em y, ou nos dois (diagonal).
//
// Está na forma generalizada, que já cobre os 8 octantes:
// reta para qualquer lado, subindo ou descendo, deitada ou
// em pé, sem precisar trocar x por y.

function bresenham(x1, y1, x2, y2) {

    const pixels = [];

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    const passoX = x1 < x2 ? 1 : -1;
    const passoY = y1 < y2 ? 1 : -1;

    let x = x1;
    let y = y1;

    let erro = dx - dy;

    while (true) {

        pixels.push(x, y);

        // chegou no ponto final: para
        if (x === x2 && y === y2) {
            break;
        }

        const erroDobrado = 2 * erro;

        if (erroDobrado > -dy) {
            erro -= dy;
            x += passoX;
        }

        if (erroDobrado < dx) {
            erro += dx;
            y += passoY;
        }
    }

    return pixels;
}


// --------------------------------------------------
// 9. FUNÇÃO 1 — IMPRIMIR UMA LINHA ENTRE DOIS PONTOS
// --------------------------------------------------
// Guarda os dois pontos, calcula os pixels com Bresenham e
// manda cada pixel para a GPU como um PONTO (gl.POINTS).
// Não existe nenhum gl.LINES aqui: quem decide o formato da
// reta é o algoritmo, não a placa de vídeo.

function tracarLinha(x1, y1, x2, y2) {

    xInicial = x1;
    yInicial = y1;
    xFinal = x2;
    yFinal = y2;

    const pixels = bresenham(x1, y1, x2, y2);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(pixels),
        gl.DYNAMIC_DRAW
    );

    gl.clearColor(FUNDO[0], FUNDO[1], FUNDO[2], 1.0);

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

    gl.uniform3f(colorLocation, cor[0], cor[1], cor[2]);

    gl.drawArrays(
        gl.POINTS,
        0,
        pixels.length / 2
    );
}


// --------------------------------------------------
// 10. FUNÇÃO 2 — ALTERAR A COR DA LINHA
// --------------------------------------------------
// Troca a cor atual e redesenha a reta que já está na tela,
// nos mesmos pontos.

function mudarCor(indice) {

    if (indice < 0 || indice > 9) {
        return;
    }

    cor = CORES[indice];

    tracarLinha(xInicial, yInicial, xFinal, yFinal);
}


// --------------------------------------------------
// 11. MOUSE — DOIS CLIQUES COM O BOTÃO ESQUERDO
// --------------------------------------------------
// O evento dá a posição em pixel da JANELA, com o y crescendo
// para BAIXO. Aqui o y é invertido para bater com o sistema
// do canvas, que cresce para cima.

canvas.addEventListener("mousedown", function (evento) {

    // 0 = botão esquerdo
    if (evento.button !== 0) {
        return;
    }

    const area = canvas.getBoundingClientRect();

    const x = Math.round(
        (evento.clientX - area.left) * canvas.width / area.width
    );

    const y = Math.round(
        canvas.height - (evento.clientY - area.top) * canvas.height / area.height
    );

    if (!esperandoSegundoClique) {

        // clique inicial: só guarda o ponto
        xClicado = x;
        yClicado = y;

        esperandoSegundoClique = true;

    } else {

        // clique final: traça a reta entre os dois cliques
        esperandoSegundoClique = false;

        tracarLinha(xClicado, yClicado, x, y);
    }
});


// --------------------------------------------------
// 12. TECLADO — TECLAS 0 A 9 TROCAM A COR
// --------------------------------------------------

window.addEventListener("keydown", function (evento) {

    if (evento.key >= "0" && evento.key <= "9") {
        mudarCor(Number(evento.key));
    }
});


// --------------------------------------------------
// 13. RETA INICIAL: (0, 0) ATÉ (0, 0), AZUL
// --------------------------------------------------

tracarLinha(0, 0, 0, 0);
