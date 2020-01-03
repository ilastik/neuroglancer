import {Viewer} from 'neuroglancer/viewer';
import {ManagedUserLayerWithSpecification} from 'neuroglancer/layer_specification'
import {ILDataSource, ILPixelClassifier, ILPixelClassificationWorkflow, ILHessianOfGaussianEigenvalues, ILGaussianSmoothing} from 'neuroglancer/util/ilastik'


//window.addEventListener('click', event => {
//
//})

export class PixelClassificationWorkflow extends ILPixelClassificationWorkflow{
  private static instance: PixelClassificationWorkflow|undefined

  private constructor(dataSource: ILDataSource){
    super(dataSource);
  }

  public static async getInstance(): Promise<PixelClassificationWorkflow>{
    if(this.instance === undefined){
      const activeDataSource = await this.getFirstLayerDataSource()
      this.instance = new PixelClassificationWorkflow(activeDataSource)
      this.instance.addFeatureExtractor(await ILGaussianSmoothing.create(0.5))
      this.instance.addFeatureExtractor(await ILHessianOfGaussianEigenvalues.create(0.5))
    }
    return this.instance
  }

  public static getFirstManagedLayer(){
    const viewer = <Viewer>((<any>window)['viewer']);
    const layerManager = viewer.layerSpecification.layerManager;
    return layerManager.managedLayers[0]!
  }

  public static async getFirstLayerDataSource(): Promise<ILDataSource>{
    const managedLayer = <ManagedUserLayerWithSpecification>this.getFirstManagedLayer();
    const url = managedLayer.sourceUrl!
    const dataSourceId = url.match(/\/datasource\/([a-zA-Z@0-9\-]+)/)![1]
    const dataSource = await ILDataSource.retrieve(dataSourceId)
    return dataSource
  }


  public async refreshPredictionLayer(){
    const predictionsLabel = 'ilastik predictions'

    const viewer = <Viewer>((<any>window)['viewer']);
    const layerManager = viewer.layerSpecification.layerManager;
    const predictionsLayer = layerManager.getLayerByName(predictionsLabel);

    if(predictionsLayer !== undefined){
      layerManager.removeManagedLayer(predictionsLayer);
    }

    if(this.pixelClassifier === undefined){
      return
    }

    const predictionsUrl = this.pixelClassifier.getPredictionsUrl(this.raw_data)

    let uniqueColors = new Map<String, Array<number>>()
    for(let annotation of this.annotations.values()){
      uniqueColors.set(String(annotation.color), annotation.color)
    }

    const colorLines = new Array<String>()
    const colorsToMix = new Array<String>()
    Array.from(uniqueColors.values()).forEach((color:Array<number>, colorIdx:number) => {
      var colorLine = `vec3 color${colorIdx} = (vec3(${color[0]}, ${color[1]}, ${color[2]}) / 255.0) * toNormalized(getDataValue(${colorIdx}));`
      colorLines.push(colorLine)
      colorsToMix.push(`color${colorIdx}`)
    })


    const predictionsFragShader = `
      void main() {
        ${colorLines.join('\n')}

        emitRGBA(
          vec4(${colorsToMix.join(' + ')}, 0.4)
        );
      }
    `
    const newPredictionsLayer = viewer.layerSpecification.getLayer(predictionsLabel, {source: predictionsUrl, shader: predictionsFragShader});
    viewer.layerSpecification.add(newPredictionsLayer);
  }

  protected async tryUpdatePixelClassifier(): Promise<ILPixelClassifier|undefined>{
    await super.tryUpdatePixelClassifier();
    await this.refreshPredictionLayer()

    return this.pixelClassifier
  }
}
