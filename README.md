# Computação Gráfica

Atividades da disciplina de Computação Gráfica — Ciência da Computação, UNIFESP.

Tudo em **WebGL** e JavaScript puro, sem bibliotecas: cada atividade escreve os próprios
shaders, buffers e matrizes de transformação.

| # | Atividade | O que pratica |
| --- | --- | --- |
| 1 | [Reta de Bresenham](atividade1) | rasterização de retas com aritmética inteira, em coordenadas de pixel |
| 2 | [Retas e triângulos de Bresenham](atividade2) | a mesma rasterização aplicada às arestas de triângulos |
| 3 | [Pong](atividade3) | jogo completo com transformações 2D (matrizes 3×3) e colisão no clip space |
| 4 | [Robô animado](atividade4) | hierarquia de objetos com orientação a objetos: braços e pernas giram presos ao corpo |
| 5 | [Helicóptero](atividade5) | cena 3D com matrizes 4×4, teste de profundidade e hélices girando |

## As atividades

### 1. Reta de Bresenham
Dois cliques definem uma reta, desenhada pixel a pixel pelo algoritmo de Bresenham. O sistema
de coordenadas é o de pixel, como o `gluOrtho2D` do OpenGL, com (0, 0) no canto inferior
esquerdo.

**Controles:** clique duas vezes na tela para traçar a reta · teclas **0–9** trocam a cor.

### 2. Retas e triângulos
Estende a atividade 1: além de retas, desenha triângulos a partir de três cliques, usando
Bresenham em cada aresta.

**Controles:** **R** retas · **T** triângulos · **0–9** cores · clique para marcar os vértices.

### 3. Pong
Pong para dois jogadores no clip space do WebGL (−1 a 1). Cada objeto é desenhado com os
vértices na origem e levado ao lugar por uma matriz 3×3: quem se move é a matriz, nunca o
buffer.

**Controles:** **W/S** movem a barra da esquerda · **↑/↓** movem a da direita.

### 4. Robô animado
Um robô montado por partes, cada uma uma classe (`RobotHead`, `RobotBody`, `RobotArm`,
`RobotLeg`) derivada de `SceneObject`. Braços e pernas nascem na origem, que é o ponto de
articulação, e por isso giram em volta do ombro e do quadril ao herdar a transformação do
corpo.

### 5. Helicóptero
A mesma ideia em 3D: corpo, eixo, cauda e as duas hélices são `SceneObject`s encadeados,
desenhados com matrizes 4×4 (`m4.js`) e teste de profundidade. As hélices giram presas ao
eixo, e a hélice traseira presa à cauda.

## Como rodar

Não precisa instalar nada. Baixe o repositório e abra o `index.html` de qualquer atividade
no navegador.

```bash
git clone https://github.com/Z4nata/ComputacaoGrafica.git
```

## Estrutura

```text
atividadeN/
  index.html   canvas e scripts da atividade
  main.js      shaders, buffers e laço de desenho
  m3.js / m4.js  matrizes 2D (3×3) e 3D (4×4), quando a atividade usa
```
