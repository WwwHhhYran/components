/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

// Workaround for: https://github.com/bazelbuild/rules_nodejs/issues/1265
/// <reference types="google.maps" />

import {
  Directive,
  Input,
  OnDestroy,
  OnInit,
  Output,
  NgZone,
  inject,
  EventEmitter,
} from '@angular/core';
import {BehaviorSubject, combineLatest, Observable, Subject} from 'rxjs';
import {map, take, takeUntil} from 'rxjs/operators';

import {GoogleMap} from '../google-map/google-map';
import {MapEventManager} from '../map-event-manager';
import {importLibrary} from '../import-library';

/**
 * Angular component that renders a Google Maps Polygon via the Google Maps JavaScript API.
 *
 * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon
 */
@Directive({
  selector: 'map-polygon',
  exportAs: 'mapPolygon',
  standalone: true,
})
export class MapPolygon implements OnInit, OnDestroy {
  private _eventManager = new MapEventManager(inject(NgZone));
  private readonly _options = new BehaviorSubject<google.maps.PolygonOptions>({});
  private readonly _paths = new BehaviorSubject<
    | google.maps.MVCArray<google.maps.MVCArray<google.maps.LatLng>>
    | google.maps.MVCArray<google.maps.LatLng>
    | google.maps.LatLng[]
    | google.maps.LatLngLiteral[]
    | undefined
  >(undefined);

  private readonly _destroyed = new Subject<void>();

  /**
   * The underlying google.maps.Polygon object.
   *
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon
   */
  polygon?: google.maps.Polygon;

  @Input()
  set options(options: google.maps.PolygonOptions) {
    this._options.next(options || {});
  }

  @Input()
  set paths(
    paths:
      | google.maps.MVCArray<google.maps.MVCArray<google.maps.LatLng>>
      | google.maps.MVCArray<google.maps.LatLng>
      | google.maps.LatLng[]
      | google.maps.LatLngLiteral[],
  ) {
    this._paths.next(paths);
  }

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.click
   */
  @Output() readonly polygonClick: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('click');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.dblclick
   */
  @Output() readonly polygonDblclick: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('dblclick');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.drag
   */
  @Output() readonly polygonDrag: Observable<google.maps.MapMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.MapMouseEvent>('drag');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.dragend
   */
  @Output() readonly polygonDragend: Observable<google.maps.MapMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.MapMouseEvent>('dragend');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.dragstart
   */
  @Output() readonly polygonDragstart: Observable<google.maps.MapMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.MapMouseEvent>('dragstart');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.mousedown
   */
  @Output() readonly polygonMousedown: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('mousedown');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.mousemove
   */
  @Output() readonly polygonMousemove: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('mousemove');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.mouseout
   */
  @Output() readonly polygonMouseout: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('mouseout');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.mouseover
   */
  @Output() readonly polygonMouseover: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('mouseover');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.mouseup
   */
  @Output() readonly polygonMouseup: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('mouseup');

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.rightclick
   */
  @Output() readonly polygonRightclick: Observable<google.maps.PolyMouseEvent> =
    this._eventManager.getLazyEmitter<google.maps.PolyMouseEvent>('rightclick');

  /** Event emitted when the polygon is initialized. */
  @Output() readonly polygonInitialized: EventEmitter<google.maps.Polygon> =
    new EventEmitter<google.maps.Polygon>();

  constructor(
    private readonly _map: GoogleMap,
    private readonly _ngZone: NgZone,
  ) {}

  ngOnInit() {
    if (this._map._isBrowser) {
      this._combineOptions()
        .pipe(take(1))
        .subscribe(options => {
          // Create the object outside the zone so its events don't trigger change detection.
          // We'll bring it back in inside the `MapEventManager` only for the events that the
          // user has subscribed to.
          this._ngZone.runOutsideAngular(async () => {
            const map = await this._map._resolveMap();
            const polygonConstructor =
              google.maps.Polygon || (await importLibrary<google.maps.Polygon>('maps', 'Polygon'));
            this.polygon = new polygonConstructor(options);
            this._assertInitialized();
            this.polygon.setMap(map);
            this._eventManager.setTarget(this.polygon);
            this.polygonInitialized.emit(this.polygon);
            this._watchForOptionsChanges();
            this._watchForPathChanges();
          });
        });
    }
  }

  ngOnDestroy() {
    this._eventManager.destroy();
    this._destroyed.next();
    this._destroyed.complete();
    this.polygon?.setMap(null);
  }

  /**
   * See
   * developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.getDraggable
   */
  getDraggable(): boolean {
    this._assertInitialized();
    return this.polygon.getDraggable();
  }

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.getEditable
   */
  getEditable(): boolean {
    this._assertInitialized();
    return this.polygon.getEditable();
  }

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.getPath
   */
  getPath(): google.maps.MVCArray<google.maps.LatLng> {
    this._assertInitialized();
    return this.polygon.getPath();
  }

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.getPaths
   */
  getPaths(): google.maps.MVCArray<google.maps.MVCArray<google.maps.LatLng>> {
    this._assertInitialized();
    return this.polygon.getPaths();
  }

  /**
   * See developers.google.com/maps/documentation/javascript/reference/polygon#Polygon.getVisible
   */
  getVisible(): boolean {
    this._assertInitialized();
    return this.polygon.getVisible();
  }

  private _combineOptions(): Observable<google.maps.PolygonOptions> {
    return combineLatest([this._options, this._paths]).pipe(
      map(([options, paths]) => {
        const combinedOptions: google.maps.PolygonOptions = {
          ...options,
          paths: paths || options.paths,
        };
        return combinedOptions;
      }),
    );
  }

  private _watchForOptionsChanges() {
    this._options.pipe(takeUntil(this._destroyed)).subscribe(options => {
      this._assertInitialized();
      this.polygon.setOptions(options);
    });
  }

  private _watchForPathChanges() {
    this._paths.pipe(takeUntil(this._destroyed)).subscribe(paths => {
      if (paths) {
        this._assertInitialized();
        this.polygon.setPaths(paths);
      }
    });
  }

  private _assertInitialized(): asserts this is {polygon: google.maps.Polygon} {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (!this.polygon) {
        throw Error(
          'Cannot interact with a Google Map Polygon before it has been ' +
            'initialized. Please wait for the Polygon to load before trying to interact with it.',
        );
      }
    }
  }
}
