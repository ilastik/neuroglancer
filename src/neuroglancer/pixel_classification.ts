import {Viewer} from 'neuroglancer/viewer';
import {ManagedUserLayerWithSpecification} from 'neuroglancer/layer_specification'
import {ILDataSource, ILPixelClassifier, ILPixelClassificationWorkflow} from 'neuroglancer/util/ilastik'
import {ILFeatureExtractor, ILHessianOfGaussianEigenvalues, ILGaussianSmoothing} from 'neuroglancer/util/ilastik'
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

  public constructor(resolve: (features: Array<ILFeatureExtractor>) => any){
    this.featuresWindow = document.createElement("div")
    this.featuresWindow.style.display = "none"
    this.featuresWindow.style.backgroundColor = "#252525"


    const column_values = [0.3, 0.7, 1.0, 1.6, 3.5, 6.0, 10.0]
    const featureCreators = new Map<string, (value: number) => Promise<ILFeatureExtractor>>([
      ["Gaussian Smoothing", (value) => {return ILGaussianSmoothing.create(value)}],
      ["Hessian Of Gaussian Eigenvalues", (value) => {return ILHessianOfGaussianEigenvalues.create(value)}],
    ])

    const table = createElement({tagName: 'table', parentElement: this.featuresWindow})
    var tr = createElement({tagName: 'tr', parentElement: table})

    createElement({tagName: 'th', parentElement: tr})
    for(let val of column_values){
      createElement({tagName: 'th', innerHTML: val.toString(), parentElement: tr})
    }

    const featureMatrix = new Map<string, Map<number, ILFeatureExtractor>>()
    featureCreators.forEach(async (featureCreator, featureName) => {
      var tr = createElement({tagName: 'tr', parentElement: table})
      createElement({tagName: 'td', innerHTML: featureName, parentElement: tr})
      featureMatrix.set(featureName, new Map<number, ILFeatureExtractor>())
      for(let val of column_values){
        const td = createElement({tagName: 'td', parentElement: tr})
        const featureExtractor = await featureCreator(val)
        createInput({inputType: 'checkbox', parentElement: td, click: async (e) => {
          const featureScales = featureMatrix.get(featureName)!
          const cb = <HTMLInputElement>e.target
          if(cb.checked){
            featureScales.set(val, featureExtractor)
          }else{
            featureScales.delete(val)
          }
        }})
      }
    })

    createInput({inputType: 'button', parentElement: this.featuresWindow, value: 'Ok', click: () => {
      const features = new Array<ILFeatureExtractor>()
      featureMatrix.forEach((featureScales) => {
        featureScales.forEach((f) => {
          features.push(f)
        })
      })
      this.hide()
      resolve(features)
    }})
  }
}

export class PixelClassificationWorkflow extends ILPixelClassificationWorkflow{
  private static instance: PixelClassificationWorkflow|undefined
  private featureSelector : FeatureSelectorPopup

  private constructor(dataSource: ILDataSource){
    super(dataSource);
    this.featureSelector = new FeatureSelectorPopup((features: Array<ILFeatureExtractor>) => {
      this.clearFeatureExtractors()
      this.addFeatureExtractors(features)
    })
  }

  public showFeatureSelection(parentElement: HTMLElement){
    this.featureSelector.show(parentElement)
  }

  public static async getInstance(): Promise<PixelClassificationWorkflow>{
    if(this.instance === undefined){
      const activeDataSource = await this.getFirstLayerDataSource()
      this.instance = new PixelClassificationWorkflow(activeDataSource)
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
