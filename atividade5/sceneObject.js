// ==================================================
// CLASS - SCENE OBJECT
// ==================================================

class SceneObject {

    constructor(
        vertices,
        colors,
        indices,
    ) {

        this.vertices = vertices;
        this.colors = colors;
        this.indices = indices;

        this.modelTransform = m4.identity();
    }

    update(modelTransform) {
        this.modelTransform = modelTransform;
    }

    updateModelTransform(modelTransform) {

        this.modelTransform =
            modelTransform;
    }

    draw(renderer) {

        renderer.draw(this);
    }
}

class HelicopterBody extends SceneObject{
    constructor(){
        super(
            helicopterBodyGeometry.vertices,
            helicopterBodyGeometry.colors,
            helicopterBodyGeometry.indices
        );
    }
}

class HelicopterTopShaft extends SceneObject{
    constructor(){
        super(
            helicopterTopShaftGeometry.vertices,
            helicopterTopShaftGeometry.colors,
            helicopterTopShaftGeometry.indices
        );
    }
}

class HelicopterTail extends SceneObject{
    constructor(){
        super(
            helicopterTailGeometry.vertices,
            helicopterTailGeometry.colors,
            helicopterTailGeometry.indices
        );
    }
}

class HelicopterPropellers extends SceneObject{
    constructor(){
        super(
            helicopterPropellersGeometry.vertices,
            helicopterPropellersGeometry.colors,
            helicopterPropellersGeometry.indices
        );

        this.theta = 0.0;

        this.angularSpeed = 0.2;
    }

    // a hélice de cima gira em volta do eixo y, que passa pela haste,
    // e depois acompanha o movimento do helicóptero
    update(helicopterTransform){

        this.theta += this.angularSpeed;

        this.modelTransform = m4.multiply(
            helicopterTransform,
            m4.yRotation(this.theta)
        );
    }
}

class HelicopterTailPropeller extends SceneObject{
    constructor(){
        super(
            helicopterTailPropellerGeometry.vertices,
            helicopterTailPropellerGeometry.colors,
            helicopterTailPropellerGeometry.indices
        );

        this.theta = 0.0;

        this.angularSpeed = 0.3;
    }

    // a hélice da cauda gira em volta do eixo z no ponto x = 0.7:
    // leva o centro dela para a origem, gira e devolve para o lugar,
    // e depois acompanha o movimento do helicóptero
    update(helicopterTransform){

        this.theta += this.angularSpeed;

        const localTransform = m4.multiply(
            m4.translation(0.7,0.0,0.0),
            m4.multiply(
                m4.zRotation(this.theta),
                m4.translation(-0.7,0.0,0.0)
            )
        );

        this.modelTransform = m4.multiply(
            helicopterTransform,
            localTransform
        );
    }
}
