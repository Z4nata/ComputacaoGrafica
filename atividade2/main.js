// --------------------------------------------------
// 0. CONTEXTO
// --------------------------------------------------
// Mesmo sistema da atividade 1: COORDENADAS DE PIXEL, igual ao
// gluOrtho2D(0, largura, 0, altura) do OpenGL, com (0, 0) no
// canto inferior esquerdo. Bresenham só faz sentido com pixel
// inteiro, então é esse o sistema usado do começo ao fim.

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
// 2. ESTADO
// --------------------------------------------------
// Só existe UMA figura na tela de cada vez. "figura" guarda os
// pixels que Bresenham calculou para ela; quando uma figura nova
// é traçada, a lista é substituída e a anterior some.

let figura = [];

let cor = CORES[0];

// modo de traçado: "reta" (2 cliques) ou "triangulo" (3 cliques)
let modo = "reta";

// cliques já dados, esperando completar a figura: [x, y, x, y, ...]
let cliques = [];


// --------------------------------------------------
// 3. VERTEX SHADER
// --------------------------------------------------
// Converte pixel (0 a 600) para clip space (-1 a 1) e desenha
// cada ponto com 1 pixel de tamanho.
//
// O "+ 0.5" joga o ponto para o CENTRO do pixel. Sem ele, o
// ponto cai bem na divisa entre quatro pixels, pinta um
// pedaço de cada um e o traço aparece apagado.

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
// O buffer é criado uma vez só; a cada figura nova ele é
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
// 9. DESENHAR A FIGURA ATUAL
// --------------------------------------------------
// Limpa a tela (é isso que apaga a figura anterior) e manda os
// pixels para a GPU como PONTOS (gl.POINTS). Não existe nenhum
// gl.LINES aqui: quem decide o formato do traço é o algoritmo,
// não a placa de vídeo.

function desenhar() {

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(figura),
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
        figura.length / 2
    );
}


// --------------------------------------------------
// 10. FUNÇÃO 1 — TRAÇAR UMA LINHA ENTRE DOIS PONTOS
// --------------------------------------------------

function tracarLinha(x1, y1, x2, y2) {

    figura = bresenham(x1, y1, x2, y2);

    desenhar();
}


// --------------------------------------------------
// 11. FUNÇÃO 2 — TRAÇAR UM TRIÂNGULO
// --------------------------------------------------
// Só as três arestas: cada lado é uma chamada de Bresenham,
// ligando os vértices em ordem e fechando do terceiro de volta
// para o primeiro. O miolo fica vazio.

function tracarTriangulo(x1, y1, x2, y2, x3, y3) {

    figura = [];

    figura = figura.concat(bresenham(x1, y1, x2, y2));
    figura = figura.concat(bresenham(x2, y2, x3, y3));
    figura = figura.concat(bresenham(x3, y3, x1, y1));

    desenhar();
}


// --------------------------------------------------
// 12. FUNÇÃO 3 — ALTERAR A COR
// --------------------------------------------------
// Troca a cor atual e redesenha a figura que já está na tela,
// nos mesmos pontos.

function mudarCor(indice) {

    if (indice < 0 || indice > 9) {
        return;
    }

    cor = CORES[indice];

    desenhar();
}


// --------------------------------------------------
// 13. MOUSE — CLIQUES COM O BOTÃO ESQUERDO
// --------------------------------------------------
// Reta precisa de 2 cliques, triângulo de 3. Os cliques vão se
// acumulando; quando o total fecha a figura, ela é traçada e a
// contagem recomeça.
//
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

    cliques.push(x, y);

    const cliquesNecessarios = modo === "reta" ? 2 : 3;

    if (cliques.length / 2 < cliquesNecessarios) {
        return;
    }

    if (modo === "reta") {

        tracarLinha(
            cliques[0], cliques[1],
            cliques[2], cliques[3]
        );

    } else {

        tracarTriangulo(
            cliques[0], cliques[1],
            cliques[2], cliques[3],
            cliques[4], cliques[5]
        );
    }

    cliques = [];
});


// --------------------------------------------------
// 14. TECLADO
// --------------------------------------------------
// R ou r  -> ativa o traçado de retas
// T ou t  -> ativa o traçado de triângulos
// 0 a 9   -> índice da cor
//
// Trocar de modo zera os cliques pendentes, senão um clique
// solto da figura anterior entraria na figura nova.

window.addEventListener("keydown", function (evento) {

    const tecla = evento.key.toLowerCase();

    if (tecla === "r") {
        modo = "reta";
        cliques = [];
        return;
    }

    if (tecla === "t") {
        modo = "triangulo";
        cliques = [];
        return;
    }

    if (evento.key >= "0" && evento.key <= "9") {
        mudarCor(Number(evento.key));
    }
});


// --------------------------------------------------
// 15. FIGURA INICIAL: LINHA AZUL DE (0, 0) ATÉ (0, 0)
// --------------------------------------------------
// Os dois pontos são iguais, então Bresenham acende um único
// pixel, no canto inferior esquerdo da tela.

tracarLinha(0, 0, 0, 0);
