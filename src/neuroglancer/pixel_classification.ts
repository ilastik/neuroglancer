import {Viewer} from 'neuroglancer/viewer';
import {ManagedUserLayerWithSpecification} from 'neuroglancer/layer_specification'
import {ILDataSource, ILFilterName, ILFeatureSpec, ILPixelClassificationWorkflow, ILAnnotation} from 'neuroglancer/util/ilastik'
import {createElement, createInput, removeFromParent} from 'neuroglancer/util/dom'


//window.addEventListener('click', event => {
//
//})

export class FeatureSelectorPopup{
  private readonly featuresWindow : HTMLElement

  public show(parentElement: HTMLElement){
    parentElement.appendChild(this.featuresWindow)
    this.featuresWindow.style.display = 'block'
  }

  public hide(){
    removeFromParent(this.featuresWindow)
    this.featuresWindow.style.display = 'none'
  }

  public constructor(resolve: (featureSpecs: Array<ILFeatureSpec>) => any, datasource: ILDataSource){
    this.featuresWindow = document.createElement("div")
    this.featuresWindow.style.display = "none"
    this.featuresWindow.style.backgroundColor = "#252525"
    this.featuresWindow.style.overflow = "auto"

    const column_values = [0.3, 0.7, 1.0, 1.6, 3.5, 6.0, 10.0]
    const featureNames = new Map<string, ILFilterName>([
      ["Gaussian Smoothing",              ILFilterName.GaussianSmoothing],
      ["Laplacian Of Gaussian",           ILFilterName.LaplacianOfGaussian],
      ["Gaussian Gradient Magnitude",     ILFilterName.GaussianGradientMagnitude],
      ["Difference Of Gaussians",         ILFilterName.DifferenceOfGaussians],
      ["Structure Tensor Eigenvalues",    ILFilterName.StructureTensorEigenvalues],
      ["Hessian Of Gaussian Eigenvalues", ILFilterName.HessianOfGaussianEigenvalues],
    ])

    const table = createElement({tagName: 'table', parentElement: this.featuresWindow})
    var tr = createElement({tagName: 'tr', parentElement: table})

    createElement({tagName: 'th', innerHTML: 'Feature / sigma', parentElement: tr})
    for(let val of column_values){
      createElement({tagName: 'th', innerHTML: val.toFixed(1), parentElement: tr})
    }

    const featureMatrix = new Map<string, Map<number, ILFeatureSpec>>()
    featureNames.forEach(async (featureName, featureLabel) => {
      let num_input_channels = (await datasource.getShape()).c
      var tr = createElement({tagName: 'tr', parentElement: table})
      createElement({tagName: 'td', innerHTML: featureLabel, parentElement: tr})
      featureMatrix.set(featureLabel, new Map<number, ILFeatureSpec>())
      for(let val of column_values){
        const td = createElement({tagName: 'td', parentElement: tr})
        if(val == 0.3 && featureName != ILFilterName.GaussianSmoothing){
            continue
        }
        const featureSpec = new ILFeatureSpec({name: featureName, scale: val, axis_2d: "z", num_input_channels})
        createInput({inputType: 'checkbox', parentElement: td, click: (e) => {
          const featureScales = featureMatrix.get(featureLabel)!
          const cb = <HTMLInputElement>e.target
          if(cb.checked){
            featureScales.set(val, featureSpec)
          }else{
            featureScales.delete(val)
          }
        }})
      }
    })

    createInput({inputType: 'button', parentElement: this.featuresWindow, value: 'Ok', click: () => {
      const featureSpecs = new Array<ILFeatureSpec>()
      featureMatrix.forEach((featureScales) => {
        featureScales.forEach((f) => {
          featureSpecs.push(f)
        })
      })
      this.hide()
      resolve(featureSpecs)
    }})
  }
}

export class PixelClassificationWorkflow extends ILPixelClassificationWorkflow{
  private static instance: PixelClassificationWorkflow|undefined
  private featureSelector : FeatureSelectorPopup


  private constructor(id: string, private raw_data: ILDataSource){ //FIXME: get from server
    super(id)
    this.featureSelector = new FeatureSelectorPopup(async (featureSpecs: Array<ILFeatureSpec>) => {
      await this.clear_feature_extractors()
      await this.add_ilp_feature_extractors(featureSpecs)
    }, raw_data)
  }

  public showFeatureSelection(parentElement: HTMLElement){
    this.featureSelector.show(parentElement)
  }

  public static async getInstance(): Promise<PixelClassificationWorkflow>{
    if(this.instance === undefined){
      const activeDataSource : ILDataSource = await this.getFirstLayerDataSource()
      const base_workflow = await ILPixelClassificationWorkflow.createEmpty() //FIXME
      this.instance = new PixelClassificationWorkflow(base_workflow.id, activeDataSource) //FIXME
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
    const dataSource = new ILDataSource(dataSourceId)
    return dataSource
  }

  public async add_ilp_feature_extractors(featureSpecs: Array<ILFeatureSpec>){
    await super.add_ilp_feature_extractors(featureSpecs)
    await this.refreshPredictionLayer()
  }

  public async add_annotations(annotations: Array<ILAnnotation>){
    await super.add_annotations(annotations)
    await this.refreshPredictionLayer()
  }

  public async remove_annotations(annotations: Array<ILAnnotation>){
    await super.remove_annotations(annotations)
    await this.refreshPredictionLayer()
  }


  public async refreshPredictionLayer(){
    const predictionsLabel = 'ilastik predictions'

    const viewer = <Viewer>((<any>window)['viewer']);
    const layerManager = viewer.layerSpecification.layerManager;
    const predictionsLayer = layerManager.getLayerByName(predictionsLabel);

    if(predictionsLayer !== undefined){
      layerManager.removeManagedLayer(predictionsLayer);
    }

    const pixelClassifier = await this.getClassifier()
    if(pixelClassifier === undefined){
      return
    }

    const predictionsUrl = pixelClassifier.getPredictionsUrl(this.raw_data)
    const predictionsFragShader = await pixelClassifier.getFragShader()

    const newPredictionsLayer = viewer.layerSpecification.getLayer(predictionsLabel, {source: predictionsUrl, shader: predictionsFragShader});
    viewer.layerSpecification.add(newPredictionsLayer);
  }
}
