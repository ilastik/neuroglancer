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
  public readonly buttons_container: HTMLDivElement
  private featureSelector: FeatureSelectorGui|undefined
  private jobs_anchor: HTMLAnchorElement
  private readonly TOKEN_STORAGE_KEY = "ilastikToken"

  constructor(public readonly workflow: PixelClassificationWorkflow){
    createElement({tagName: "h3", parentElement: this.container, innerHTML: "Pixel Classification Tools"})

    this.buttons_container = <HTMLDivElement>createElement({tagName: "div", parentElement: this.container})

    createInput({inputType: 'button', value: 'Features', parentElement: this.buttons_container, click: () => {
      this.showFeatureSelector()
    }})

    createInput({inputType: 'button', value: 'get .ilp', parentElement: this.buttons_container, click: () => {
      this.workflow.downloadIlp()
    }})

    createInput({inputType: 'button', value: 'save to cloud', parentElement: this.buttons_container, click: () => {
      let token = window.localStorage.getItem(this.TOKEN_STORAGE_KEY)
      if(token === null){
        this.getIlastikToken()
        return
      }
      this.uploadToCloud(token)
    }})

    this.jobs_anchor = <HTMLAnchorElement>createElement({tagName: "a", parentElement: this.container, innerHTML: "Go to job runner"})
    this.jobs_anchor.target = "_blank"
    this.jobs_anchor.style.display = 'none'
    this.jobs_anchor.style.color = 'white'
  }

  private getIlastikToken(){
    let token_url = "https://web.ilastik.org/token/"
    window.open(token_url)

    let token_controls =  createElement({tagName: "div", parentElement: this.container, innerHTML: "<h4>Ilastik Token</h4>"})
    createElement({tagName: "p", parentElement: token_controls, innerHTML: `Please copy your token from ${token_url} into the field below`})
    let token_text_input = createInput({inputType: "text", parentElement: token_controls})
    createInput({inputType: "button", parentElement: token_controls, value: "OK", click: () => {
      let token = token_text_input.value
      if(!token){
        return
      }
      window.localStorage.setItem(this.TOKEN_STORAGE_KEY, token)
      removeFromParent(token_controls)
      this.uploadToCloud(token)
    }})
    createInput({inputType: "button", parentElement: token_controls, value: "Cancel", click: () => {
      removeFromParent(token_controls)
    }})
  }

  private async uploadToCloud(token: string){
    let upload_controls = createElement({tagName: "div", parentElement: this.container, innerHTML: `
      <h4>Project upload</h4>
      <label>Project name: </label>
    `})
    let project_name_input = createInput({inputType: "text", parentElement: upload_controls})
    createInput({inputType: 'button', parentElement: upload_controls, value: "Ok", click: async () => {
      let projectName = project_name_input.value
      if(!projectName){
        return
      }
      try{
        let payload = await this.workflow.upload_to_cloud_ilastik(token, projectName)
        this.jobs_anchor.href = payload["html_url"]
        this.jobs_anchor.style.display = "inline"
      }catch(ex){
        this.jobs_anchor.style.display = "none"
        alert(ex)
      }finally{
        removeFromParent(upload_controls)
      }
    }})
    createInput({inputType: "button", parentElement: upload_controls, value: "Cancel", click: () => {
      removeFromParent(upload_controls)
    }})
  }

  private async showFeatureSelector(){
    if(this.featureSelector !== undefined){
      this.featureSelector.hide()
    }
    this.featureSelector = await FeatureSelectorGui.create(
      this.workflow,
      async (featureSpecs: Array<ILFeatureSpec>) => {
        this.workflow.dropPredictionLayer()
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
  private refresh_counter = 0;
  public readonly predictionsLabel = 'ilastik predictions'

  public async getFirstRawDataSource() : Promise<ILDataSource>{
    const lanes = await this.getLanes()
    if(lanes.length == 0){
      debugger
      throw new Error("No lanes in workflow!")
    }
    const datasource_info = await lanes[0].getRawData()
    return await datasource_info.getDataSource()
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
    this.dropPredictionLayer()
    await super.add_ilp_feature_extractors(featureSpecs)
    this.refreshpredictionlayer()
  }

  public async add_annotations(annotations: Array<ILAnnotation>){
    this.dropPredictionLayer()
    await super.add_annotations(annotations)
    this.refreshpredictionlayer()
  }

  public async remove_annotations(annotations: Array<ILAnnotation>){
    this.dropPredictionLayer()
    await super.remove_annotations(annotations)
    this.refreshpredictionlayer()
  }


  public dropPredictionLayer(){
    const viewer = <Viewer>((<any>window)['viewer']);
    const layerManager = viewer.layerSpecification.layerManager;
    const predictionsLayer = layerManager.getLayerByName(this.predictionsLabel);

    if(predictionsLayer !== undefined){
      layerManager.removeManagedLayer(predictionsLayer);
    }
  }

  public async refreshpredictionlayer(){
    const this_refresh_counter = ++this.refresh_counter
    const pixelClassifier = await this.getClassifier()
    if(pixelClassifier === undefined){
      return
    }

    const predictionsUrl = pixelClassifier.getPredictionsUrl(await this.getFirstRawDataSource())
    const predictionsFragShader = await pixelClassifier.getFragShader()
    if(this.refresh_counter != this_refresh_counter){
      console.log("Abandoning stale refresh of prediction-layer")
      return
    }

    this.dropPredictionLayer()
    const viewer = <Viewer>((<any>window)['viewer']);
    const newPredictionsLayer = viewer.layerSpecification.getLayer(
      this.predictionsLabel,
      {source: predictionsUrl, shader: predictionsFragShader}
    );
    viewer.layerSpecification.add(newPredictionsLayer);
  }
}
