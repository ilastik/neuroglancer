import {Viewer} from 'neuroglancer/viewer';
import {ManagedUserLayerWithSpecification} from 'neuroglancer/layer_specification'
import {ILDataSource, ILPixelClassifier, ILPixelClassificationWorkflow, ILHessianOfGaussian, ILGaussianSmoothing} from 'neuroglancer/util/ilastik'


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
      this.instance.addFeatureExtractor(await ILHessianOfGaussian.create(0.5))
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

    if(this.pixelClassifier === undefined){
      return
    }

    if(predictionsLayer !== undefined){
      layerManager.removeManagedLayer(predictionsLayer);
    }

    const predictionsUrl = this.pixelClassifier.getPredictionsUrl(this.raw_data)
    const newPredictionsLayer = viewer.layerSpecification.getLayer(predictionsLabel, predictionsUrl);
    viewer.layerSpecification.add(newPredictionsLayer);
  }

  protected async tryUpdatePixelClassifier(): Promise<ILPixelClassifier|undefined>{
    await super.tryUpdatePixelClassifier();
    await this.refreshPredictionLayer()

    return this.pixelClassifier
  }
}
