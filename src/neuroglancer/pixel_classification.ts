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

  public constructor(num_input_channels: number, resolve: (featureSpecs: Array<ILFeatureSpec>) => any){
    this.featuresWindow = document.createElement("div")
    this.featuresWindow.style.display = "none"
    this.featuresWindow.style.backgroundColor = "#252525"
    this.featuresWindow.style.overflow = "auto"

    const column_values = [0.3, 0.7, 1.0, 1.6, 3.5, 5.0, 10.0]
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
  private featureSelector: FeatureSelectorPopup|undefined

  public async getFirstRawDataSource() : Promise<ILDataSource>{
    const lanes = await this.getLanes()
    if(lanes.length == 0){
      debugger
      throw new Error("No lanes in workflow!")
    }
    const datasource_info = await lanes[0].getRawData()
    return await datasource_info.getDataSource()
  }

  public async showFeatureSelection(parentElement: HTMLElement){
    if(this.featureSelector === undefined){
      const datasource = await this.getFirstRawDataSource()
      const shape = await datasource.getShape()
      this.featureSelector = new FeatureSelectorPopup(
        shape.c,
        async (featureSpecs: Array<ILFeatureSpec>) => {
          await this.clear_feature_extractors()
          await this.add_ilp_feature_extractors(featureSpecs)
        }
      )
    }
    this.featureSelector.show(parentElement)
  }

  public getIlastikToken(): string|null{
    let key = "ilastikToken"
    let storage = window.localStorage
    let token = storage.getItem(key)
    if(token != null){
      return token
    }
    let token_url = "https://web.ilastik.org/token/"
    window.open(token_url)
    let copied_token = prompt(`Please copy your ilastik token (from ${token_url} here`)
    if(copied_token == null){
      return null
    }
    storage.setItem(key, copied_token)
    return copied_token
  }

  public async interactiveUploadToCloud(){
    let token = this.getIlastikToken()
    if(token == null){
      return
    }
    let projectName = prompt("Please enter a project name:")
    if(projectName == null){
      return
    }
    let payload = await super.upload_to_cloud_ilastik(token, projectName)

    alert(`Success! You can now fire jobs from ${payload["html_url"]} !`)
    window.open(payload["html_url"]) //FIXME: this is not opening  anew tab -.-
  }

  public static async getInstance(): Promise<PixelClassificationWorkflow>{
    if(this.instance === undefined){
      const managedLayer = <ManagedUserLayerWithSpecification>this.getFirstManagedLayer();
      var data_url = managedLayer.sourceUrl!
      if(!data_url.startsWith("precomputed://")){
        throw new Error("Only precomputed chunks support for now!")
      }
      data_url += "/data" //FIXME: this assume sa single scale ant that its key is "data"
      const base_workflow = await ILPixelClassificationWorkflow.createEmpty() //FIXME
      await base_workflow.add_lane_for_url(data_url)
      this.instance = new PixelClassificationWorkflow(base_workflow.__self__) //FIXME
    }
    return this.instance
  }

  public static getFirstManagedLayer(){
    const viewer = <Viewer>((<any>window)['viewer']);
    const layerManager = viewer.layerSpecification.layerManager;
    return layerManager.managedLayers[0]!
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

    const predictionsUrl = pixelClassifier.getPredictionsUrl(await this.getFirstRawDataSource())
    const predictionsFragShader = await pixelClassifier.getFragShader()

    const newPredictionsLayer = viewer.layerSpecification.getLayer(predictionsLabel, {source: predictionsUrl, shader: predictionsFragShader});
    viewer.layerSpecification.add(newPredictionsLayer);
  }
}
