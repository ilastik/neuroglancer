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

import {AnnotationType, AnnotationBase, typeHandlers, annotationTypes} from 'neuroglancer/annotation';
import {AnnotationRenderContext, AnnotationRenderHelper, registerAnnotationTypeRenderHandler} from 'neuroglancer/annotation/type_handler';
import {mat4, vec3} from 'neuroglancer/util/geom';
import {emitterDependentShaderGetter, ShaderBuilder} from 'neuroglancer/webgl/shader';
import {Uint64} from 'neuroglancer/util/uint64';
import {GL} from 'neuroglancer/webgl/context';
import {Buffer} from 'neuroglancer/webgl/buffer';
import {ILAnnotation, ILColor} from 'neuroglancer/util/ilastik'
import {PixelClassificationWorkflow} from 'neuroglancer/pixel_classification'
import {UserLayerWithAnnotations} from 'neuroglancer/ui/annotations'

export class RenderHelper extends AnnotationRenderHelper {
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

  drawAnnotation(context: AnnotationRenderContext, annotation: BrushAnnotation){
    const shader = this.shaderGetter(context.renderContext.emitter);
    this.enable(shader, context, () => {
      const {gl} = this;
      annotation.setColorUniform(shader.uniform('uBrushColor'), gl);
      const aVertexPosition = shader.attribute('aVertexPosition');
      const voxelCoordsBuffer = annotation.bindVoxelCoordsToAttribute(aVertexPosition, gl)
      gl.drawArrays(WebGL2RenderingContext.LINE_STRIP, /*first*/0, annotation.getNumVoxels())//, /*isntanceCount*/1)
      //gl.vertexAttribDivisor(aVertexPosition, 0);
      gl.disableVertexAttribArray(aVertexPosition);
      voxelCoordsBuffer.dispose()
    });
  }
}

export interface Brush extends AnnotationBase{
  type: AnnotationType.BRUSH;
}

export class BrushAnnotation implements Brush{
  type: AnnotationType.BRUSH = AnnotationType.BRUSH;
  public description = '';

  public static readonly POINTS_PER_STROKE = 2000;
  public static readonly COORDS_PER_POINT = 3;
  public static readonly BYTES_PER_COORD = 4; //float takes 4 bytes
  public static readonly BYTES_FOR_POINTS = BrushAnnotation.POINTS_PER_STROKE * BrushAnnotation.COORDS_PER_POINT * BrushAnnotation.BYTES_PER_COORD
  public static readonly BYTES_FOR_POINT_COUNTER = 4 // 1 32bit number
  public static readonly BYTES_FOR_COLOR = 3 * 4 //rgb (3), each channel is a 4-byte Float
  public static readonly NUM_SERIALIZED_BYTES = BrushAnnotation.BYTES_FOR_POINTS + BrushAnnotation.BYTES_FOR_POINT_COUNTER + BrushAnnotation.BYTES_FOR_COLOR

  private data: Uint8Array //can't be ArrayBuffer because i need to rember offsets
  private numVoxels: Uint32Array
  private voxelCoords: Float32Array
  private color: Float32Array

  private upstreamAnnotation: ILAnnotation|undefined

  constructor(public readonly layer:UserLayerWithAnnotations, public readonly firstVoxel: vec3, color:vec3, public segments?: Uint64[], public id=''){
    const data = new Uint8Array(BrushAnnotation.NUM_SERIALIZED_BYTES)
    this.data = data
    this.numVoxels =   new Uint32Array (data.buffer, data.byteOffset,                                           1)
    this.voxelCoords = new Float32Array(data.buffer, this.numVoxels.byteOffset +   this.numVoxels.byteLength,   BrushAnnotation.POINTS_PER_STROKE * BrushAnnotation.COORDS_PER_POINT)
    this.color =       new Float32Array(data.buffer, this.voxelCoords.byteOffset + this.voxelCoords.byteLength, 3) //3 float components: rgb

    this.numVoxels[0] = 0

    this.addVoxel(firstVoxel);
    this.setColor(color);
  }

  public bindVoxelCoordsToAttribute(attributeIndex: number, gl: GL): Buffer{
    const buffer = new Buffer(gl);
    buffer.setData(this.voxelCoords.subarray(0, this.getNumVoxels() * BrushAnnotation.COORDS_PER_POINT))
    buffer.bindToVertexAttrib(attributeIndex,
                              /*components=*/3,
                              /*attributeType=*/WebGL2RenderingContext.FLOAT,
                              /*normalized=*/false,
                              /*stride=*/0,
                              /*offset=*/0);
    return buffer
  }

  public setColorUniform(uniformIndex: WebGLUniformLocation, gl: GL){
      gl.uniform3fv(uniformIndex, this.color);
  }

  public getNumVoxels(): number{
    return this.numVoxels[0]
  }

  public getColor(): vec3{
    return vec3.fromValues(this.color[0], this.color[1], this.color[2])
  }

  public setColor(value: vec3){
    this.color[0] = value[0]
    this.color[1] = value[1]
    this.color[2] = value[2]
  }


  private appendVoxelToBuffer(voxelCoords: vec3){
    var offset = this.getNumVoxels() * BrushAnnotation.COORDS_PER_POINT
    this.voxelCoords[offset + 0] = voxelCoords[0]
    this.voxelCoords[offset + 1] = voxelCoords[1]
    this.voxelCoords[offset + 2] = voxelCoords[2]
    this.numVoxels[0] = this.numVoxels[0] + 1
  }

  public getVoxel(idx: number): vec3{
    const baseOffset = idx * BrushAnnotation.COORDS_PER_POINT
    return vec3.fromValues(this.voxelCoords[baseOffset + 0], this.voxelCoords[baseOffset + 1], this.voxelCoords[baseOffset + 2])
  }

  public addVoxel(voxelCoords: vec3){
    const roundedCoordsVoxel = vec3.fromValues(Math.floor(voxelCoords[0]),
                                               Math.floor(voxelCoords[1]),
                                               Math.floor(voxelCoords[2]));

    if(this.getNumVoxels() > 0){
      const lastVoxel = this.getVoxel(this.getNumVoxels() - 1)
      if(vec3.equals(lastVoxel, roundedCoordsVoxel)){
        console.log(`Discarding repeated voxel ${roundedCoordsVoxel}`)
        return
      }
    }

    console.log(`Adding new voxel ${roundedCoordsVoxel}`)
    this.appendVoxelToBuffer(roundedCoordsVoxel)
  }

  public fillWithCoords(buffer: Uint8Array){
    buffer.set(this.data)
  }

  public toJsonData(){
    const jsonPoints = new Array<{x:number, y:number, z:number}>()
    for(let i=0; i<this.getNumVoxels(); i++){
      let voxel = this.getVoxel(i);
      jsonPoints.push({x: voxel[0], y: voxel[1], z: voxel[2]})
    }
    const brushColor = this.getColor()
    return {
      voxels: jsonPoints,
      color: {
        r: Math.floor(brushColor[0] * 255),
        g: Math.floor(brushColor[1] * 255),
        b: Math.floor(brushColor[2] * 255),
        a: 255
      },
    }
  }

  public async upload(){
    const pixelWorkflow = await PixelClassificationWorkflow.getInstance()
    const dataSource = await PixelClassificationWorkflow.getFirstLayerDataSource()
    const jsonData = this.toJsonData()

    this.upstreamAnnotation = await ILAnnotation.create(jsonData.voxels, new ILColor(jsonData.color), dataSource)

    pixelWorkflow.add_annotations([this.upstreamAnnotation])
  }

  public async destroy(){
    const workflow = await PixelClassificationWorkflow.getInstance()
    workflow.remove_annotations([this.upstreamAnnotation!])
  }
}

typeHandlers.set(AnnotationType.BRUSH, {
  icon: '🖌',
  description: 'Brush Strokes',
  toJSON: (annotation: Brush) => {
    console.log(`FIXME ${annotation}`)
    return {fixme: "fixme"}
  },
  restoreState: (annotation: Brush, obj: any) => {
    console.log(`FIXME ${annotation}  ${obj}`)
  },
  serializedBytes: BrushAnnotation.NUM_SERIALIZED_BYTES,
  serializer: (buffer: ArrayBuffer, offset: number, numAnnotations: number) => {
    //FIXME: this feels a lot like the serializer defined in brush.ts
    const coordinates = new Uint8Array(buffer, offset, numAnnotations * BrushAnnotation.NUM_SERIALIZED_BYTES);
    return (annotation: Brush, index: number) => {
      console.log(`FIXME -> serializer at annotation/index.ts ${annotation} ${index} ${coordinates}`)
    };
  },
});

annotationTypes.push(AnnotationType.BRUSH)

registerAnnotationTypeRenderHandler(AnnotationType.BRUSH, {
  bytes: BrushAnnotation.NUM_SERIALIZED_BYTES,
  serializer: (buffer: ArrayBuffer, offset: number, numAnnotations: number) => {
    const dataBuffer = new Uint8Array(buffer, offset, numAnnotations * BrushAnnotation.NUM_SERIALIZED_BYTES);
    return (annotation: Brush, index: number) => {
      const annotationByteOffset = dataBuffer.byteOffset + (index * BrushAnnotation.NUM_SERIALIZED_BYTES)
      const annotationBuffer = new Uint8Array(dataBuffer.buffer, annotationByteOffset, BrushAnnotation.NUM_SERIALIZED_BYTES)
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
