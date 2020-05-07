import {Viewer} from 'neuroglancer/viewer';
import {ManagedUserLayerWithSpecification} from 'neuroglancer/layer_specification'
import {ILDataSource, ILFilterName, ILFeatureSpec, ILPixelClassificationWorkflow, ILAnnotation} from 'neuroglancer/util/ilastik'
import {createElement, createInput, removeFromParent} from 'neuroglancer/util/dom'


//window.addEventListener('click', event => {
//
//})

export class FeatureSelectorGui{
  private readonly featuresWindow : HTMLElement

  public show(parentElement: HTMLElement){
    parentElement.appendChild(this.featuresWindow)
    this.featuresWindow.style.display = 'block'
  }

  public hide(){
    removeFromParent(this.featuresWindow)
    this.featuresWindow.style.display = 'none'
  }

  public static async create(
    workflow: PixelClassificationWorkflow, resolve: (featureSpecs: Array<ILFeatureSpec>) => any, axis_2d: string = 'z'
  ): Promise<FeatureSelectorGui>{
    const datasource = await workflow.getFirstRawDataSource()
    const num_input_channels = (await datasource.getShape()).c
    let preselected_features = new Map<string, Set<number>>();
    (await workflow.get_ilp_feature_extractors()).forEach(spec => {
      let scale_set = preselected_features.get(spec.name) || new Set<number>()
      scale_set.add(spec.scale)
      preselected_features.set(spec.name, scale_set)
    })
    return new FeatureSelectorGui(preselected_features, num_input_channels, axis_2d, resolve)
  }

  private constructor(
    preselected_features: Map<string, Set<number>>,
    num_input_channels: number,
    axis_2d: string = 'z',
    resolve: (featureSpecs: Array<ILFeatureSpec>) => any
  ){
    this.featuresWindow = document.createElement("div")
    this.featuresWindow.style.display = "none"
    this.featuresWindow.style.backgroundColor = "#252525"
    this.featuresWindow.style.overflow = "auto"

    var selected_features = new Set<ILFeatureSpec>()

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
    for(let scale of column_values){
      createElement({tagName: 'th', innerHTML: scale.toFixed(1), parentElement: tr})
    }

    featureNames.forEach(async (featureName, featureDisplayName) => {
      var tr = createElement({tagName: 'tr', parentElement: table, innerHTML: `<td>${featureDisplayName}</td>`})
      for(let scale of column_values){
        const td = createElement({tagName: 'td', parentElement: tr})
        if(scale == 0.3 && featureName != ILFilterName.GaussianSmoothing){
            continue
        }
        const featureSpec = new ILFeatureSpec({name: featureName, scale, axis_2d, num_input_channels})
        let checkbox = createInput({inputType: 'checkbox', parentElement: td, click: (e) => {
          let cb = <HTMLInputElement>e.target
          if(cb.checked){
            selected_features.add(featureSpec)
          }else{
            selected_features.delete(featureSpec)
          }
        }})
        if(preselected_features.get(featureName) && preselected_features.get(featureName)!.has(scale)){
          checkbox.click()
        }
      }
    })

    createInput({inputType: "button", parentElement: this.featuresWindow, value: "All", click: (e) => {
        let button = <HTMLInputElement>e.target;
        this.featuresWindow.querySelectorAll("input[type=checkbox]").forEach((checkbox) => {
            let cb = <HTMLInputElement>checkbox
            if((button.value == "All" && !cb.checked) || (button.value == "None" && cb.checked)){
                cb.click()
            }
        })
        button.value = button.value == "All" ? "None" : "All"
    }})

    createInput({inputType: 'button', parentElement: this.featuresWindow, value: 'Ok', click: () => {
      this.hide()
      resolve(Array.from(selected_features))
    }})
  }
}

export class IlastikToolbox{
  public readonly container: HTMLDivElement = document.createElement("div")
  private featureSelector: FeatureSelectorGui|undefined

  constructor(public readonly workflow: PixelClassificationWorkflow){
    createElement({tagName: "h3", parentElement: this.container, innerHTML: "Pixel Classification Tools"})
    createInput({inputType: 'button', value: 'Features', parentElement: this.container, click: () => {
      this.showFeatureSelector()
    }})

    createInput({inputType: 'button', value: 'get .ilp', parentElement: this.container, click: () => {
      this.workflow.downloadIlp()
    }})

    createInput({inputType: 'button', value: 'save to cloud', parentElement: this.container, click: () => {
      this.workflow.interactiveUploadToCloud()
    }})
  }

  private async showFeatureSelector(){
    if(this.featureSelector !== undefined){
      this.featureSelector.hide()
    }
    this.featureSelector = await FeatureSelectorGui.create(
      this.workflow,
      async (featureSpecs: Array<ILFeatureSpec>) => {
        await this.workflow.clear_feature_extractors()
        if(featureSpecs.length > 0){
          await this.workflow.add_ilp_feature_extractors(featureSpecs)
        }
      }
    )
    this.featureSelector.show(this.container)
  }
}

export class PixelClassificationWorkflow extends ILPixelClassificationWorkflow{
  private static instance: PixelClassificationWorkflow|undefined

  public async getFirstRawDataSource() : Promise<ILDataSource>{
    const lanes = await this.getLanes()
    if(lanes.length == 0){
      debugger
      throw new Error("No lanes in workflow!")
    }
    const datasource_info = await lanes[0].getRawData()
    return await datasource_info.getDataSource()
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
