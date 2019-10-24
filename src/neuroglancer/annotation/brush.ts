/**
 * @license
 * Copyright 2018 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file Support for rendering point annotations.
 */

import {AnnotationType, Brush, BrushAnnotation, BrushStrokeStruct} from 'neuroglancer/annotation';
import {AnnotationRenderContext, AnnotationRenderHelper, registerAnnotationTypeRenderHandler} from 'neuroglancer/annotation/type_handler';
import {mat4, vec3} from 'neuroglancer/util/geom';
import {emitterDependentShaderGetter, ShaderBuilder} from 'neuroglancer/webgl/shader';

class RenderHelper extends AnnotationRenderHelper {
  private shaderGetter = emitterDependentShaderGetter(this, this.gl, (builder: ShaderBuilder) => this.defineShader(builder));

  defineShader(builder: ShaderBuilder) {
    super.defineShader(builder);
    // Position of point in camera coordinates.
    builder.addAttribute('highp vec3', 'aVertexPosition');
    builder.addUniform('highp vec3', 'uBrushColor')
    builder.setVertexMain(`
      gl_Position = uProjection * vec4(aVertexPosition, 1.0);
    `);
    builder.setFragmentMain(`
      emit(vec4(uBrushColor, 1), 7u); // "7" is just some (for now) made-up pickId
    `);
  }

  draw(context: AnnotationRenderContext) {
    //if((<any>window)['brushing']){debugger}
    const shader = this.shaderGetter(context.renderContext.emitter);
    this.enable(shader, context, () => {
      const {gl} = this;
      const uBrushColor = shader.uniform('uBrushColor');
      const aVertexPosition = shader.attribute('aVertexPosition');

      gl.uniform3fv(uBrushColor, new Float32Array([0, 0, 1])); //BLUE

      context.buffer.bindToVertexAttrib(aVertexPosition,
                                        /*components=*/3,
                                        /*attributeType=*/WebGL2RenderingContext.FLOAT,
                                        /*normalized=*/false,
                                        /*stride=*/0,
                                        /*offset=*/context.bufferOffset + 4); //skipping 4 bytes that keep the color

      gl.drawArrays(WebGL2RenderingContext.LINE_STRIP, /*first*/0, /*count*/100)//, /*isntanceCount*/1)
      //gl.vertexAttribDivisor(aVertexPosition, 0);
      gl.disableVertexAttribArray(aVertexPosition);
    });
  }
}

registerAnnotationTypeRenderHandler(AnnotationType.BRUSH, {
  bytes: BrushStrokeStruct.NUM_SERIALIZED_BYTES,
  serializer: (buffer: ArrayBuffer, offset: number, numAnnotations: number) => {
    const dataBuffer = new Uint8Array(buffer, offset, numAnnotations * BrushStrokeStruct.NUM_SERIALIZED_BYTES);
    return (annotation: Brush, index: number) => {
      const annotationByteOffset = dataBuffer.byteOffset + (index * BrushStrokeStruct.NUM_SERIALIZED_BYTES)
      const annotationBuffer = new Uint8Array(dataBuffer.buffer, annotationByteOffset, BrushStrokeStruct.NUM_SERIALIZED_BYTES)
      const brushAnnotation = <BrushAnnotation>(<unknown>annotation)
      brushAnnotation.fillWithCoords(annotationBuffer)
    };
  },
  sliceViewRenderHelper: RenderHelper,
  perspectiveViewRenderHelper: RenderHelper,
  pickIdsPerInstance: 1,
  snapPosition: (position: vec3, objectToData, data, offset) => {
    vec3.transformMat4(position, <vec3>new Float32Array(data, offset, 3), objectToData);
  },
  getRepresentativePoint: (objectToData, ann) => {
    console.log(`FIXME!!!!!!!!!!! ${ann}`)
    const firstPoint = (<BrushAnnotation>(<unknown>ann)).firstVoxel;
    let repPoint = vec3.create();
    vec3.transformMat4(repPoint, firstPoint, objectToData);
    return repPoint;
  },
  updateViaRepresentativePoint: (oldAnnotation: Brush, position: vec3, dataToObject: mat4) => {
    console.log(`Fix updateViaRepresentativePoint ${position}  ${dataToObject}`)
    return oldAnnotation;
  }
});
