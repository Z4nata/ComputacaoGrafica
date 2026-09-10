// --------------------------------------------------
// 0. CONTEXTO
// --------------------------------------------------
// Todo o jogo vive no clip space do WebGL: x e y vão de -1 a 1,
// com (0, 0) no centro da tela. Como o canvas é quadrado
// (600 x 600), uma unidade em x mede o mesmo que uma unidade em
// y, então nada aparece esticado e as contas de colisão podem
// ser feitas direto nesse sistema, sem projeção nenhuma.
//
// Cada objeto é desenhado com os vértices na ORIGEM e levado
// para o lugar certo por uma matriz 3x3 (m3.js). Quem se mexe é
// a matriz, nunca o buffer de vértices.

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL 2 não é suportado.");
}

const mensagem = document.getElementById("mensagem");


// --------------------------------------------------
// 1. MEDIDAS E REGRAS DO JOGO
// --------------------------------------------------
// Tudo em unidades de clip space. Os "meia largura / meia
// altura" existem porque a barra é desenhada centrada na
// origem: ela vai de -0.05 a 0.05 em x e de -0.2 a 0.2 em y.

const BARRA_MEIA_LARGURA = 0.05;
const BARRA_MEIA_ALTURA  = 0.2;

const BARRA_X_ESQUERDA = -0.9;
const BARRA_X_DIREITA  =  0.9;

// face interna da barra: é nela que a bola bate
const FACE_ESQUERDA = BARRA_X_ESQUERDA + BARRA_MEIA_LARGURA;   // -0.85
const FACE_DIREITA  = BARRA_X_DIREITA  - BARRA_MEIA_LARGURA;   //  0.85

const RAIO_BOLA = 0.05;

// deslocamentos por quadro, medidos a 60 quadros por segundo
const VELOCIDADE_BARRA     = 0.030;
const VELOCIDADE_BOLA      = 0.012;   // saque
const VELOCIDADE_BOLA_MAX  = 0.030;   // teto, senão a bola some
const ACELERACAO_REBATIDA  = 1.06;    // 6% mais rápida a cada rebatida

// ângulo máximo de saída ao bater na ponta da barra (55 graus)
const ANGULO_MAXIMO = 55 * Math.PI / 180;

const PONTOS_PARA_VENCER = 5;

// tempo parado no centro depois de cada ponto (milissegundos)
const ESPERA_SAQUE = 800;

const COR_BARRA_ESQUERDA = [0.0, 1.0, 0.0];
const COR_BARRA_DIREITA  = [0.0, 0.0, 1.0];
const COR_BOLA           = [1.0, 0.0, 0.0];
const COR_REDE           = [0.35, 0.35, 0.40];


// --------------------------------------------------
// 2. VÉRTICES
// --------------------------------------------------
// Três formas bastam para o jogo inteiro:
//   barra    - retângulo centrado na origem
//   bola     - leque de triângulos aproximando um círculo
//   quadrado - quadrado de 0 a 1, usado como "tijolo" para
//              desenhar a rede do meio e os dígitos do placar
//              (a matriz de escala dá o tamanho de cada um)

function verticesBarra() {
    return new Float32Array([
        -BARRA_MEIA_LARGURA,  BARRA_MEIA_ALTURA,
        -BARRA_MEIA_LARGURA, -BARRA_MEIA_ALTURA,
         BARRA_MEIA_LARGURA,  BARRA_MEIA_ALTURA,
         BARRA_MEIA_LARGURA,  BARRA_MEIA_ALTURA,
        -BARRA_MEIA_LARGURA, -BARRA_MEIA_ALTURA,
         BARRA_MEIA_LARGURA, -BARRA_MEIA_ALTURA
    ]);
}

function verticesBola() {
    let vertices = [];
    let numSegments = 30;
    let radius = RAIO_BOLA;

    for (let i = 0; i < numSegments; i++) {
        let theta1 = (i / numSegments) * 2 * Math.PI;
        let theta2 = ((i + 1) / numSegments) * 2 * Math.PI;

        vertices.push(0, 0); // centro do círculo
        vertices.push(radius * Math.cos(theta1), radius * Math.sin(theta1));
        vertices.push(radius * Math.cos(theta2), radius * Math.sin(theta2));
    }

    return new Float32Array(vertices);
}

function verticesQuadrado() {
    return new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        0, 1,
        1, 0,
        1, 1
    ]);
}


// --------------------------------------------------
// 3. ESTADO DO JOGO
// --------------------------------------------------

// posição vertical das barras (o x delas é fixo)
let tyBE = 0.0;
let tyBD = 0.0;

// posição e velocidade da bola
let txBola = 0.0;
let tyBola = 0.0;
let vxBola = 0.0;
let vyBola = 0.0;

let placarEsquerda = 0;
let placarDireita  = 0;

// "jogando" | "pausado" | "fim"
let estado = "jogando";

let esperaSaque = ESPERA_SAQUE;

// barra da direita controlada pelo computador
let cpuLigada = false;

// teclas que estão pressionadas neste instante
const teclas = {};

// matrizes de transformação de cada objeto
let MbarraEsquerda = m3.translation(BARRA_X_ESQUERDA, tyBE);
let MbarraDireita  = m3.translation(BARRA_X_DIREITA,  tyBD);
let MbolaCentro    = m3.identity();


// --------------------------------------------------
// 4. VERTEX SHADER
// --------------------------------------------------
// A matriz 3x3 chega em u_transform. O vértice vira um vec3 com
// z = 1 para que a última coluna da matriz (a translação) tenha
// efeito — é o truque das coordenadas homogêneas em 2D.

const vertexShaderSource = `#version 300 es

in vec2 aPosition;

uniform mat3 u_transform;

void main() {
    vec3 position = u_transform * vec3(aPosition, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
}

`;


// --------------------------------------------------
// 5. FRAGMENT SHADER
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
// 6. COMPILAR SHADERS
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
// 7. CRIAR PROGRAMA
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
// 8. LOCAL DOS ATRIBUTOS E DOS UNIFORMS
// --------------------------------------------------

const positionLocation =
    gl.getAttribLocation(
        program,
        "aPosition"
    );

const colorLocation =
    gl.getUniformLocation(
        program,
        "uColor"
    );

const transformLocation =
    gl.getUniformLocation(
        program,
        "u_transform"
    );


// --------------------------------------------------
// 9. BUFFERS
// --------------------------------------------------
// Cada forma tem o seu buffer, carregado UMA vez só. No
// esqueleto o gl.bufferData era refeito a cada quadro; não
// precisa: os vértices nunca mudam, quem muda é a matriz.

function criarBuffer(vertices) {

    const buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.bufferData(
        gl.ARRAY_BUFFER,
        vertices,
        gl.STATIC_DRAW
    );

    return { buffer: buffer, quantidade: vertices.length / 2 };
}

const formaBarra    = criarBuffer(verticesBarra());
const formaBola     = criarBuffer(verticesBola());
const formaQuadrado = criarBuffer(verticesQuadrado());


// --------------------------------------------------
// 10. DESENHO GENÉRICO
// --------------------------------------------------
// Toda figura passa por aqui: escolhe o buffer, manda a cor e a
// matriz, desenha. As três funções de desenho do esqueleto
// viraram três chamadas desta.

function desenhaForma(forma, cor, matriz) {

    gl.bindBuffer(gl.ARRAY_BUFFER, forma.buffer);

    gl.enableVertexAttribArray(positionLocation);

    gl.vertexAttribPointer(
        positionLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0
    );

    gl.uniform3fv(colorLocation, cor);

    gl.uniformMatrix3fv(transformLocation, false, matriz);

    gl.drawArrays(gl.TRIANGLES, 0, forma.quantidade);
}

// Retângulo com o canto inferior esquerdo em (x, y).
// A matriz é composta: primeiro a escala, depois a translação.
// Em m3, m3.translate(m, x, y) devolve T * m, ou seja, a escala
// acontece antes e o resultado é levado para o lugar.

function desenhaRetangulo(x, y, largura, altura, cor) {

    const matriz = m3.translate(
        m3.scaling(largura, altura),
        x, y
    );

    desenhaForma(formaQuadrado, cor, matriz);
}


// --------------------------------------------------
// 11. PLACAR EM SETE SEGMENTOS
// --------------------------------------------------
// Não existe função de texto em WebGL, então cada dígito é
// montado com os sete tracinhos do mostrador de calculadora:
//
//      aaa
//     f   b
//      ggg
//     e   c
//      ddd
//
// Cada tracinho é o MESMO quadrado unitário, só que escalado e
// transladado por uma matriz diferente.

const SEGMENTOS_DO_DIGITO = [
    "abcdef",   // 0
    "bc",       // 1
    "abged",    // 2
    "abgcd",    // 3
    "fgbc",     // 4
    "afgcd",    // 5
    "afgedc",   // 6
    "abc",      // 7
    "abcdefg",  // 8
    "abcdfg"    // 9
];

function desenhaDigito(digito, x, y, largura, altura, espessura, cor) {

    const segmentos = SEGMENTOS_DO_DIGITO[digito];

    const meio = (altura - espessura) / 2;
    const xDireita = x + largura - espessura;

    // horizontais
    if (segmentos.includes("a")) {
        desenhaRetangulo(x, y + altura - espessura, largura, espessura, cor);
    }
    if (segmentos.includes("g")) {
        desenhaRetangulo(x, y + meio, largura, espessura, cor);
    }
    if (segmentos.includes("d")) {
        desenhaRetangulo(x, y, largura, espessura, cor);
    }

    // verticais de cima: vão do meio até o topo, sobrepondo um
    // pouco os tracinhos horizontais para não deixar falha
    if (segmentos.includes("f")) {
        desenhaRetangulo(x, y + meio, espessura, altura - meio, cor);
    }
    if (segmentos.includes("b")) {
        desenhaRetangulo(xDireita, y + meio, espessura, altura - meio, cor);
    }

    // verticais de baixo
    if (segmentos.includes("e")) {
        desenhaRetangulo(x, y, espessura, meio + espessura, cor);
    }
    if (segmentos.includes("c")) {
        desenhaRetangulo(xDireita, y, espessura, meio + espessura, cor);
    }
}

function desenhaNumero(numero, xCentro, y, cor) {

    const largura   = 0.09;
    const altura    = 0.20;
    const espessura = 0.025;
    const espaco    = 0.035;

    const texto = String(numero);

    const larguraTotal =
        texto.length * largura + (texto.length - 1) * espaco;

    let x = xCentro - larguraTotal / 2;

    for (let i = 0; i < texto.length; i++) {

        desenhaDigito(
            Number(texto[i]),
            x, y,
            largura, altura, espessura,
            cor
        );

        x += largura + espaco;
    }
}


// --------------------------------------------------
// 12. DESENHO DE CADA OBJETO
// --------------------------------------------------

function drawRede() {

    const largura = 0.012;
    const altura  = 0.06;
    const passo   = 0.12;

    for (let y = -0.98; y < 1.0; y += passo) {
        desenhaRetangulo(-largura / 2, y, largura, altura, COR_REDE);
    }
}

function drawBarraEsquerda() {
    desenhaForma(formaBarra, COR_BARRA_ESQUERDA, MbarraEsquerda);
}

function drawBarraDireita() {
    desenhaForma(formaBarra, COR_BARRA_DIREITA, MbarraDireita);
}

function drawBolaCentro() {
    desenhaForma(formaBola, COR_BOLA, MbolaCentro);
}

// afastados do centro, como no Pong original, para atrapalhar
// o mínimo possível a visão da bola
function drawPlacar() {
    desenhaNumero(placarEsquerda, -0.42, 0.72, COR_BARRA_ESQUERDA);
    desenhaNumero(placarDireita,   0.42, 0.72, COR_BARRA_DIREITA);
}


// --------------------------------------------------
// 13. TECLADO
// --------------------------------------------------
// O movimento não acontece aqui: o evento só anota que a tecla
// está pressionada. Quem move é o quadro seguinte, senão a barra
// andaria no ritmo da repetição de teclas do sistema.

window.addEventListener("keydown", function (evento) {

    const tecla = evento.key.toLowerCase();

    teclas[tecla] = true;

    // as setas rolam a página se a gente deixar
    if (tecla === "arrowup" || tecla === "arrowdown") {
        evento.preventDefault();
    }

    if (tecla === "r") {
        reiniciarPartida();
        return;
    }

    if (tecla === "c") {
        cpuLigada = !cpuLigada;
        atualizaMensagem();
        return;
    }

    if (tecla === "p" && estado !== "fim") {
        estado = estado === "pausado" ? "jogando" : "pausado";
        atualizaMensagem();
    }
});

window.addEventListener("keyup", function (evento) {
    teclas[evento.key.toLowerCase()] = false;
});


// --------------------------------------------------
// 14. MOVIMENTO DAS BARRAS
// --------------------------------------------------
// O limite é 1 - meia altura: assim a barra encosta na borda mas
// não atravessa.

const LIMITE_BARRA = 1.0 - BARRA_MEIA_ALTURA;

function limita(valor, minimo, maximo) {
    return Math.min(Math.max(valor, minimo), maximo);
}

function moveBarras(passo) {

    if (teclas["w"]) {
        tyBE += VELOCIDADE_BARRA * passo;
    }
    if (teclas["s"]) {
        tyBE -= VELOCIDADE_BARRA * passo;
    }

    if (cpuLigada) {

        // o computador persegue a bola, mas devagar o bastante
        // para ainda ser possível ganhar dele
        const alvo = esperaSaque > 0 ? 0 : tyBola;
        const distancia = alvo - tyBD;
        const maximo = VELOCIDADE_BARRA * 0.75 * passo;

        tyBD += limita(distancia, -maximo, maximo);

    } else {

        if (teclas["arrowup"]) {
            tyBD += VELOCIDADE_BARRA * passo;
        }
        if (teclas["arrowdown"]) {
            tyBD -= VELOCIDADE_BARRA * passo;
        }
    }

    tyBE = limita(tyBE, -LIMITE_BARRA, LIMITE_BARRA);
    tyBD = limita(tyBD, -LIMITE_BARRA, LIMITE_BARRA);

    MbarraEsquerda = m3.translation(BARRA_X_ESQUERDA, tyBE);
    MbarraDireita  = m3.translation(BARRA_X_DIREITA,  tyBD);
}


// --------------------------------------------------
// 15. SAQUE E PONTUAÇÃO
// --------------------------------------------------

function sacar(direcao) {

    txBola = 0.0;
    tyBola = 0.0;

    // ângulo de saída sorteado entre -25 e 25 graus, para o
    // saque não sair sempre igual
    const angulo = (Math.random() * 2 - 1) * (25 * Math.PI / 180);

    vxBola = direcao * VELOCIDADE_BOLA * Math.cos(angulo);
    vyBola = VELOCIDADE_BOLA * Math.sin(angulo);

    esperaSaque = ESPERA_SAQUE;

    MbolaCentro = m3.translation(txBola, tyBola);
}

function marcaPonto(lado) {

    if (lado === "esquerda") {
        placarEsquerda++;
    } else {
        placarDireita++;
    }

    if (placarEsquerda >= PONTOS_PARA_VENCER ||
        placarDireita  >= PONTOS_PARA_VENCER) {

        estado = "fim";

        vxBola = 0;
        vyBola = 0;
        txBola = 0;
        tyBola = 0;

        MbolaCentro = m3.translation(txBola, tyBola);

    } else {

        // quem levou o ponto recebe a bola
        sacar(lado === "esquerda" ? -1 : 1);
    }

    atualizaMensagem();
}

function reiniciarPartida() {

    placarEsquerda = 0;
    placarDireita  = 0;

    tyBE = 0.0;
    tyBD = 0.0;

    estado = "jogando";

    sacar(Math.random() < 0.5 ? -1 : 1);

    atualizaMensagem();
}


// --------------------------------------------------
// 16. REBATIDA
// --------------------------------------------------
// O ângulo de saída depende de ONDE a bola bateu na barra: no
// meio ela volta reta, na ponta volta bem inclinada. É isso que
// permite ao jogador mirar, em vez de a bola só espelhar.
//
// A velocidade também cresce um pouco a cada rebatida, até um
// teto — é o que dá ritmo ao ponto.

function rebate(direcao, tyBarra) {

    const alcance = BARRA_MEIA_ALTURA + RAIO_BOLA;

    const impacto = limita((tyBola - tyBarra) / alcance, -1, 1);

    const angulo = impacto * ANGULO_MAXIMO;

    const velocidade = Math.min(
        Math.hypot(vxBola, vyBola) * ACELERACAO_REBATIDA,
        VELOCIDADE_BOLA_MAX
    );

    vxBola = direcao * velocidade * Math.cos(angulo);
    vyBola = velocidade * Math.sin(angulo);

    // encosta a bola na face da barra para ela não ficar presa
    // dentro do retângulo no quadro seguinte
    txBola = direcao > 0
        ? FACE_ESQUERDA + RAIO_BOLA
        : FACE_DIREITA  - RAIO_BOLA;
}


// --------------------------------------------------
// 17. ANIMAÇÃO
// --------------------------------------------------
// "passo" é quanto tempo passou desde o quadro anterior, medido
// em quadros de 60 Hz. Num monitor de 144 Hz ele vale ~0.42 e o
// jogo anda na mesma velocidade de um de 60 Hz.
//
// A colisão com a barra é testada por CRUZAMENTO: guarda-se onde
// a bola estava antes e verifica-se se ela passou pela face da
// barra entre um quadro e outro. Testar só a posição atual
// falharia quando a bola andasse mais que a espessura da barra.

function atualizaAnimacao(passo, delta) {

    if (estado !== "jogando") {
        return;
    }

    moveBarras(passo);

    // depois de um ponto a bola espera parada no centro
    if (esperaSaque > 0) {
        esperaSaque -= delta;
        return;
    }

    const xAnterior = txBola;

    txBola += vxBola * passo;
    tyBola += vyBola * passo;

    // paredes de cima e de baixo
    if (tyBola + RAIO_BOLA > 1.0) {
        tyBola = 1.0 - RAIO_BOLA;
        vyBola = -Math.abs(vyBola);
    }
    if (tyBola - RAIO_BOLA < -1.0) {
        tyBola = -1.0 + RAIO_BOLA;
        vyBola = Math.abs(vyBola);
    }

    // barra da esquerda
    if (vxBola < 0 &&
        xAnterior - RAIO_BOLA >= FACE_ESQUERDA &&
        txBola    - RAIO_BOLA <= FACE_ESQUERDA &&
        Math.abs(tyBola - tyBE) <= BARRA_MEIA_ALTURA + RAIO_BOLA) {

        rebate(1, tyBE);
    }

    // barra da direita
    if (vxBola > 0 &&
        xAnterior + RAIO_BOLA <= FACE_DIREITA &&
        txBola    + RAIO_BOLA >= FACE_DIREITA &&
        Math.abs(tyBola - tyBD) <= BARRA_MEIA_ALTURA + RAIO_BOLA) {

        rebate(-1, tyBD);
    }

    // saiu pela lateral: ponto de quem estava do outro lado
    if (txBola - RAIO_BOLA > 1.0) {
        marcaPonto("esquerda");
    }
    if (txBola + RAIO_BOLA < -1.0) {
        marcaPonto("direita");
    }

    MbolaCentro = m3.translation(txBola, tyBola);
}


// --------------------------------------------------
// 18. MENSAGEM DE TEXTO
// --------------------------------------------------

function atualizaMensagem() {

    if (estado === "fim") {

        const vencedor = placarEsquerda > placarDireita ? "verde" : "azul";

        mensagem.textContent =
            "O jogador " + vencedor + " venceu por " +
            Math.max(placarEsquerda, placarDireita) + " a " +
            Math.min(placarEsquerda, placarDireita) +
            ". Aperte R para jogar de novo.";

        return;
    }

    if (estado === "pausado") {
        mensagem.textContent = "Pausado. Aperte P para continuar.";
        return;
    }

    mensagem.textContent = cpuLigada
        ? "Barra azul no automático (C desliga)."
        : "";
}


// --------------------------------------------------
// 19. LAÇO PRINCIPAL
// --------------------------------------------------

let tempoAnterior = 0;

function drawScene(tempoAtual) {

    // no primeiro quadro não existe "anterior", então o passo é
    // 1. O teto de 100 ms evita que a bola atravesse a tela de
    // uma vez quando a aba fica em segundo plano e o navegador
    // segura os quadros.
    const delta = tempoAnterior === 0
        ? 1000 / 60
        : Math.min(tempoAtual - tempoAnterior, 100);

    tempoAnterior = tempoAtual;

    const passo = delta / (1000 / 60);

    atualizaAnimacao(passo, delta);

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    drawRede();
    drawPlacar();
    drawBarraEsquerda();
    drawBarraDireita();

    // acabou a partida: a bola sai de cena e só fica o placar
    if (estado !== "fim") {
        drawBolaCentro();
    }

    requestAnimationFrame(drawScene);
}


// --------------------------------------------------
// 20. INÍCIO DO DESENHO
// --------------------------------------------------

gl.clearColor(0.1, 0.1, 0.1, 1.0);

gl.clear(gl.COLOR_BUFFER_BIT);

sacar(Math.random() < 0.5 ? -1 : 1);

atualizaMensagem();

requestAnimationFrame(drawScene);
